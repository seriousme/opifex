import {
  AnyPacket,
  AuthenticationResult,
  ConnectPacket,
  PublishPacket,
  debug,
  Deferred,
  Dup,
  MqttConn,
  PacketType,
  Payload,
  Timer,
  Topic,
} from "./deps.ts";

import { handlePacket } from "./handlers/handlePacket.ts";

import { MemoryStore } from "./memoryStore.ts";

export enum ConnectionState {
  offline = "offline",
  connecting = "connecting",
  connected = "connected",
  disconnecting = "disconnecting",
  disconnected = "disconnected",
}

export class Context {
  mqttConn?: MqttConn;
  connectionState: ConnectionState;
  pingTimer?: Timer;
  unresolvedConnect?: Deferred<AuthenticationResult>;
  store: MemoryStore;
  onopen = () => {};
  onconnect = () => {};
  onmessage = (topic: Topic, payload: Payload, dup?: Dup) => {};
  onclose = () => {};
  onerror = (err: Error) => {};

  constructor(store: MemoryStore) {
    this.store = store;
    this.connectionState = ConnectionState.offline;
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
    this.onopen();
  }

  publish(packet:PublishPacket){
    this.onmessage(packet.topic, packet.payload, packet.dup)
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
    debug.log({ send: packet });
    if (
      this.connectionState === ConnectionState.connected &&
      !this.mqttConn?.isClosed
    ) {
      debug.log("sending", this.mqttConn?.isClosed);

      await this.mqttConn?.send(packet);
      this.pingTimer?.reset();
      return;
    }
    debug.log("not connected");
    this.pingTimer?.clear();
  }

  sendPing() {
    this.send({ type: PacketType.pingreq });
  }

  async handleConnection(
    conn: Deno.Conn,
    connectPacket: ConnectPacket,
  ): Promise<boolean> {
    this.mqttConn = new MqttConn({ conn });
    if (this.mqttConn === undefined) {
      return true;
    }
    await this.connect(connectPacket);
    try {
      for await (const packet of this.mqttConn) {
        handlePacket(this, packet);
      }
    } catch (err) {
      debug.log(err);
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
    debug.log("closing connection");
    this.connectionState = ConnectionState.disconnected;
    this.pingTimer?.clear();
    this.onclose();
  }
}
