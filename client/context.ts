import {
  AsyncQueue,
  Deferred,
  logger,
  MqttConn,
  MQTTLevel,
  nextTick,
  PacketType,
  Timer,
} from "./deps.ts";
import type {
  AnyPacket,
  ConnectPacket,
  MemoryStore,
  PacketId,
  ProtocolLevel,
  PublishPacket,
  ReturnCodes,
  SockConn,
  SubscribePacket,
  TAuthenticationResult,
  UnsubscribePacket,
} from "./deps.ts";

import { handlePacket } from "./handlers/handlePacket.ts";
import type { TConnectionState } from "./ConnectionState.ts";
import { ConnectionState } from "./ConnectionState.ts";
import type { Client } from "./client.ts";

export class Context {
  mqttConn?: MqttConn;
  #connectionState: TConnectionState;
  protocolLevel: ProtocolLevel;
  pingTimer?: Timer;
  unresolvedConnect?: Deferred<TAuthenticationResult>;
  unresolvedPublish: Map<PacketId, Deferred<void>>;
  unresolvedSubscribe: Map<PacketId, Deferred<ReturnCodes>>;
  unresolvedUnSubscribe: Map<PacketId, Deferred<void>>;
  store: MemoryStore;
  incoming: AsyncQueue<PublishPacket>;
  #client: Client;

  constructor(store: MemoryStore, client: Client) {
    this.#client = client;
    this.store = store;
    this.#connectionState = ConnectionState.offline;
    this.protocolLevel = MQTTLevel.unknown;
    this.incoming = new AsyncQueue();
    this.unresolvedPublish = new Map();
    this.unresolvedSubscribe = new Map();
    this.unresolvedUnSubscribe = new Map();
  }

  get connectionState(): TConnectionState {
    return this.#connectionState;
  }

  set connectionState(state: TConnectionState) {
    this.#connectionState = state;
    switch (state) {
      case "connected":
        queueMicrotask(this.#client.onConnected);
        break;
      case "disconnected":
        queueMicrotask(this.#client.onDisconnected);
        break;
    }
  }

  async connect(packet: ConnectPacket) {
    this.connectionState = ConnectionState.connecting;
    if (packet.protocolLevel === MQTTLevel.unknown) {
      packet.protocolLevel = MQTTLevel.v4;
    }
    this.protocolLevel = packet.protocolLevel;
    await this.mqttConn?.send(packet);
    const keepAlive = packet.keepAlive || 0;
    if (keepAlive > 0) {
      this.pingTimer = new Timer(
        this.sendPing.bind(this),
        keepAlive * 1000,
        true,
      );
    }
  }

  async disconnect() {
    if (this.connectionState !== ConnectionState.connected) {
      throw "Not connected";
    }
    if (this.mqttConn) {
      this.connectionState = ConnectionState.disconnecting;
      await this.mqttConn.send({
        type: PacketType.disconnect,
        protocolLevel: this.protocolLevel,
      });
      this.mqttConn.close();
      this.protocolLevel = MQTTLevel.unknown;
    }
  }

  async send(packet: AnyPacket) {
    logger.debug({ send: packet });
    if (
      this.connectionState === ConnectionState.connected &&
      !this.mqttConn?.isClosed
    ) {
      await this.mqttConn?.send(packet);
      this.pingTimer?.reset();
      await nextTick(); // Yield to allow other tasks to run
      return;
    }
    logger.debug("not connected");
    this.pingTimer?.clear();
  }

  sendPing() {
    this.send({
      type: PacketType.pingreq,
      protocolLevel: this.protocolLevel,
    });
  }

  async handleConnection(
    conn: SockConn,
    connectPacket: ConnectPacket,
  ): Promise<boolean> {
    this.mqttConn = new MqttConn({ conn });
    try {
      logger.debug("Send connect packet", connectPacket);
      await this.connect(connectPacket);
      logger.debug("Accepting packets");
      for await (const packet of this.mqttConn) {
        await handlePacket(this, packet);
      }
      logger.debug("No more packets");
    } catch (err) {
      // TODO: can we replace this with an assert that ensures err to be instanceof Error?
      if (err instanceof Error) {
        queueMicrotask(() => this.#client.onError(err));
      }
      logger.debug(`error ${err}`);
      if (!this.mqttConn.isClosed) {
        this.mqttConn.close();
      }
    }
    if (this.connectionState === ConnectionState.disconnecting) {
      return false;
    }
    return true;
  }

  close() {
    logger.debug("closing connection");
    this.connectionState = ConnectionState.disconnected;
    this.pingTimer?.clear();
  }

  receivePublish(packet: PublishPacket) {
    this.incoming.push(packet);
  }

  async publish(packet: PublishPacket): Promise<void> {
    const qos = packet.qos || 0;
    if (qos === 0) {
      packet.id = 0;
      await this.send(packet);
      // return empty promise
      return Promise.resolve();
    }
    packet.id = this.store.nextId();
    this.store.pendingOutgoing.set(packet.id, packet);
    const deferred = new Deferred<void>();
    this.unresolvedPublish.set(packet.id, deferred);
    await this.send(packet);
    return deferred.promise;
  }

  async subscribe(packet: SubscribePacket): Promise<ReturnCodes> {
    packet.id = this.store.nextId();
    this.store.pendingOutgoing.set(packet.id, packet);
    const deferred = new Deferred<ReturnCodes>();
    this.unresolvedSubscribe.set(packet.id, deferred);
    await this.send(packet);
    return deferred.promise;
  }

  async unsubscribe(packet: UnsubscribePacket): Promise<void> {
    packet.id = this.store.nextId();
    this.store.pendingOutgoing.set(packet.id, packet);
    const deferred = new Deferred<void>();
    this.unresolvedUnSubscribe.set(packet.id, deferred);
    await this.send(packet);
    return deferred.promise;
  }

  receivePuback(id: PacketId): boolean {
    const unresolvedMap = this.unresolvedPublish;
    if (unresolvedMap.has(id)) {
      const deferred = unresolvedMap.get(id);
      unresolvedMap.delete(id);
      deferred?.resolve();
      return true;
    }
    return false;
  }

  // just an alias to clarify protocol flow
  receivePubcomp(id: PacketId): boolean {
    return this.receivePuback(id);
  }

  receiveSuback(id: PacketId, returnCodes: ReturnCodes): boolean {
    const unresolvedMap = this.unresolvedSubscribe;
    if (unresolvedMap.has(id)) {
      const deferred = unresolvedMap.get(id);
      unresolvedMap.delete(id);
      deferred?.resolve(returnCodes);
      return true;
    }
    return false;
  }

  receiveUnsuback(id: PacketId): boolean {
    const unresolvedMap = this.unresolvedUnSubscribe;
    if (unresolvedMap.has(id)) {
      const deferred = unresolvedMap.get(id);
      unresolvedMap.delete(id);
      deferred?.resolve();
      return true;
    }
    return false;
  }
}
