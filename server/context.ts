import {
  AnyPacket,
  AuthenticationResult,
  Client,
  ClientState,
  MqttConn,
  PacketType,
  Persistence,
  PublishPacket,
  SockConn,
  Timer,
  Topic,
  debug
} from "./deps.ts";

export const SysPrefix = "$";

export const utf8Encoder = new TextEncoder();

export type Handlers = {
  isAuthenticated?(
    ctx: Context,
    clientId: string,
    username: string,
    password: Uint8Array,
  ): AuthenticationResult;
  isAuthorizedToPublish?(ctx: Context, topic: Topic): boolean;
  isAuthorizedToSubscribe?(ctx: Context, topic: Topic): boolean;
};

export class Context {
  connected: boolean;
  conn: SockConn;
  mqttConn: MqttConn;
  persistence: Persistence;
  handlers: Handlers;
  client?: Client;
  will?: PublishPacket;
  timer?: Timer;

  constructor(persistence: Persistence, conn: SockConn, handlers: Handlers) {
    this.persistence = persistence;
    this.connected = false;
    this.conn = conn;
    this.mqttConn = new MqttConn({ conn });
    this.handlers = handlers;
  }

  async send(packet: AnyPacket): Promise<void> {
    debug.log("Sending", PacketType[packet.type]);
    debug.log(JSON.stringify(packet, null, 2));
    this.mqttConn.send(packet);
  }

  connect(
    clientId: string,
    clean: boolean,
    handler: Function,
    close: Function,
  ): void {
    this.client = this.getClient(clientId, clean, handler, close);
    this.connected = true;
    this.client.state = ClientState.online;
    this.broadcast("$SYS/connect/clients", clientId);
  }

  private getClient(
    clientId: string,
    clean: boolean,
    handler: Function,
    close: Function,
  ) {
    const existingClient = this.persistence.getClient(clientId);
    if (existingClient) {
      existingClient.close(false);
      if (!clean) {
        existingClient.handler = handler;
        existingClient.close = close;
        return existingClient;
      }
      this.clean(clientId);
    }
    return this.persistence.registerClient(
      clientId,
      handler,
      close,
    );
  }

  clean(clientId: string) {
    this.persistence.deregisterClient(clientId);
  }

  close(executewill = true): void {
    if (this.connected) {
      debug.log(
        `Closing ${this.client
          ?.id} while mqttConn is ${
          this.mqttConn.isClosed ? "" : "not "
        }closed`,
      );
      this.connected = false;
      if (this.client) {
        this.client.state = ClientState.offline;
        this.client.handler = () => {};
        this.client.close = () => {};
        this.broadcast("$SYS/disconnect/clients", this.client.id);
        if (typeof this.timer === "object") {
          this.timer.clear();
        }
      }
      if (executewill) {
        this.handleWill();
      }
    }
    if (!this.mqttConn.isClosed) {
      this.mqttConn.close();
    }
  }

  private handleWill() {
    if (this.will) {
      if (
        !this.will.topic.startsWith(SysPrefix) &&
        this.handlers.isAuthorizedToPublish &&
        this.handlers.isAuthorizedToPublish(this, this.will.topic)
      ) {
        this.persistence.publish(this.will.topic, this.will);
      }
    }
  }

  broadcast(topic: Topic, payload: string, retain = false): void {
    const packet: PublishPacket = {
      type: PacketType.publish,
      topic,
      retain,
      payload: utf8Encoder.encode(payload),
    };
    if (packet.retain === true) {
      this.persistence.retained.set(packet.topic, packet);
    }
    this.persistence.publish(packet.topic, packet);
  }
}
