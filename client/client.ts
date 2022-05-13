import {
  ConnackPacket,
  MqttConn,
  PacketType,
} from "./deps.ts";

import { createMqttConn, Deferred, Timer } from "./deps.ts";

function generateClientId(prefix: string): string {
  return `${prefix}-${Math.random().toString().slice(-10)}`;
}

function backOffSleep(random: boolean, attempt: number): Promise<void> {
  // based on https://dthain.blogspot.com/2009/02/exponential-backoff-in-distributed.html
  const factor = 1.5;
  const min = 1000;
  const max = 5000;
  const randomness = 1 + (random ? Math.random() : 0);
  const delay = Math.floor(
    Math.min(randomness * min * Math.pow(factor, attempt), max),
  );
  return new Promise((resolve) => setTimeout(resolve, delay));
}

const DefaultURL = "mqtt://localhost:1883/";

enum ConnectionState {
  offline = "offline",
  connected = "connected",
  disconnecting = "disconnecting",
  disconnected = "disconnected",
}

export class Client {
  private clientIdPrefix = "opifex";
  private url: URL;
  private certFile: string | undefined;
  private numberOfRetries: number;
  private clientId: string;
  private connectionState: ConnectionState;
  private mqttConn: MqttConn | undefined;
  private unresolvedConnect?: Deferred<ConnackPacket>;
  private debug: Function;

  constructor(logger?: Function ) {
    this.connectionState = ConnectionState.offline;
    this.url = new URL(DefaultURL);
    this.clientId = "";
    this.numberOfRetries = 3; // Infinity;
    this.debug = logger || (() => {});
  }

  protected async createConn(): Promise<Deno.Conn> {
    const protocol = this.url.protocol;
    const hostname = this.url.hostname;

    // if you need to support alternative connection types just 
    // overload this method in your subclass
    if (protocol === "mqtts:") {
      return this.connectMQTTS(protocol, hostname);
    }
    if (protocol === "mqtt:") {
      return this.connectMQTT(protocol, hostname);
    }
    throw `Unsupported protocol: ${protocol}`;
  }

  private async connectMQTT(protocol: string, hostname: string) {
    const port = Number(this.url.port) || 1883;
    this.debug({ protocol, hostname, port });
    return await Deno.connect({ port });
  }

  private async connectMQTTS(protocol: string, hostname: string) {
    const port = Number(this.url.port) || 8883;
    const certFile = this.certFile;
    this.debug({ protocol, hostname, port });
    return await Deno.connectTls({ hostname, port, certFile });
  }

  private async doConnect(numberOfRetries: number): Promise<void> {
    let ipConnected = false;
    let attempt = 0;
    let lastMessage = "";
    while ((ipConnected === false) && (attempt < numberOfRetries)) {
      try {
        const conn = await this.createConn();
        this.mqttConn = createMqttConn({ conn });
        this.handleConnection(this.mqttConn);
        await this.mqttConn.send({
          type: PacketType.connect,
          clientId: this.clientId,
        });
        ipConnected = true;
      } catch (err) {
        lastMessage = `Connection failed: ${err.message}`;
        this.debug(lastMessage);
        await backOffSleep(true, attempt++);
      }
    }
    if (ipConnected === false) {
      this.unresolvedConnect?.reject(Error(lastMessage));
    }
  }

  async connect(
    params?: {
      url?: string;
      certFile?: string;
      clientId?: string;
      numberOfRetries?: number;
    },
  ): Promise<ConnackPacket> {
    this.url = params?.url ? new URL(params?.url) : this.url;
    this.certFile = params?.certFile;
    this.clientId = params?.clientId || generateClientId(this.clientIdPrefix);
    this.numberOfRetries = params?.numberOfRetries || this.numberOfRetries;
    const deferred = new Deferred<ConnackPacket>();
    this.unresolvedConnect = deferred;
    this.doConnect(this.numberOfRetries);
    return deferred.promise;
  }

  async disconnect(): Promise<void> {
    if (this.connectionState !== ConnectionState.connected) {
      throw "Not connected";
    }
    if (this.mqttConn) {
      await this.mqttConn.send({ type: PacketType.disconnect });
      this.mqttConn.close();
    }
    this.connectionState = ConnectionState.disconnected;
  }

  private async handleConnection(mqttConn: MqttConn): Promise<void> {
    if (mqttConn === undefined) {
      return;
    }
    try {
      for await (const packet of mqttConn) {
        this.debug(JSON.stringify(packet, null, 2));
        if (this.connectionState !== ConnectionState.connected) {
          if (packet.type === PacketType.connack) {
            this.connectionState = ConnectionState.connected;
            this.unresolvedConnect?.resolve(packet);
          } else {
            throw new Error(`Received ${packet.type} packet before connect`);
          }
        } else {
          switch (packet.type) {
            case PacketType.publish:
              const message = new TextDecoder().decode(packet.payload);
              this.debug(
                `publish: topic: ${packet.topic} message: ${message}`,
              );
              break;
            default:
              throw new Error(
                `Received unexpected ${packet.type} packet after connect`,
              );
              break;
          }
        }
      }
    } catch (err) {
      console.error(`Failed to handle packet: ${err}`);
      if (!mqttConn.isClosed) {
        mqttConn.close();
      }
      this.connectionState = ConnectionState.disconnected;
    }
  }
}
