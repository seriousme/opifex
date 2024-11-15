import {
  type AnyPacket,
  AsyncQueue,
  type ConnectPacket,
  Deferred,
  logger,
  type MemoryStore,
  MqttConn,
  type PacketId,
  PacketType,
  type PublishPacket,
  type ReturnCodes,
  type SockConn,
  type SubscribePacket,
  type TAuthenticationResult,
  Timer,
  type UnsubscribePacket,
} from "./deps.ts";

import { handlePacket } from "./handlers/handlePacket.ts";
import type { TConnectionState } from "./ConnectionState.ts";
import { ConnectionState } from "./ConnectionState.ts";

export class Context {
  mqttConn?: MqttConn;
  connectionState: TConnectionState;
  pingTimer?: Timer;
  unresolvedConnect?: Deferred<TAuthenticationResult>;
  unresolvedPublish: Map<PacketId, Deferred<void>>;
  unresolvedSubscribe: Map<PacketId, Deferred<ReturnCodes>>;
  unresolvedUnSubscribe: Map<PacketId, Deferred<void>>;
  store: MemoryStore;
  incoming: AsyncQueue<PublishPacket>;

  constructor(store: MemoryStore) {
    this.store = store;
    this.connectionState = ConnectionState.offline;
    this.incoming = new AsyncQueue();
    this.unresolvedPublish = new Map();
    this.unresolvedSubscribe = new Map();
    this.unresolvedUnSubscribe = new Map();
  }

  async connect(packet: ConnectPacket) {
    this.connectionState = ConnectionState.connecting;
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
      await this.mqttConn.send({ type: PacketType.disconnect });
      this.mqttConn.close();
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
      return;
    }
    logger.debug("not connected");
    this.pingTimer?.clear();
  }

  sendPing() {
    this.send({ type: PacketType.pingreq });
  }

  async handleConnection(
    conn: SockConn,
    connectPacket: ConnectPacket,
  ): Promise<boolean> {
    this.mqttConn = new MqttConn({ conn });
    if (this.mqttConn === undefined) {
      return true;
    }
    logger.debug("Send connect packet");
    await this.connect(connectPacket);
    try {
      logger.debug("Accepting packets");
      for await (const packet of this.mqttConn) {
        handlePacket(this, packet);
      }
      logger.debug("No more packets");
    } catch (err) {
      logger.debug(err);
      if (this.mqttConn.isClosed) {
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

  publish(packet: PublishPacket): Promise<void> {
    const qos = packet.qos || 0;
    if (qos === 0) {
      packet.id = 0;
      this.send(packet);
      // return empty promise
      return Promise.resolve();
    }
    packet.id = this.store.nextId();
    this.store.pendingOutgoing.set(packet.id, packet);
    const deferred = new Deferred<void>();
    this.unresolvedPublish.set(packet.id, deferred);
    this.send(packet);
    return deferred.promise;
  }

  subscribe(packet: SubscribePacket): Promise<ReturnCodes> {
    packet.id = this.store.nextId();
    this.store.pendingOutgoing.set(packet.id, packet);
    const deferred = new Deferred<ReturnCodes>();
    this.unresolvedSubscribe.set(packet.id, deferred);
    this.send(packet);
    return deferred.promise;
  }

  unsubscribe(packet: UnsubscribePacket): Promise<void> {
    packet.id = this.store.nextId();
    this.store.pendingOutgoing.set(packet.id, packet);
    const deferred = new Deferred<void>();
    this.unresolvedUnSubscribe.set(packet.id, deferred);
    this.send(packet);
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
