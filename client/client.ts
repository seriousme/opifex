import {
  AnyPacket,
  ConnackPacket,
  ConnectPacket,
  Deferred,
  MqttConn,
  PacketType,
  PublishPacket,
  SubscribePacket,
  Timer,
} from "./deps.ts";

function generateClientId(prefix: string): string {
  return `${prefix}-${Math.random().toString().slice(-10)}`;
}

type ConnectOptions = Omit<
  ConnectPacket,
  "type" | "protocolName" | "protocolLevel"
>;
export type ConnectParameters = {
  url?: string;
  certFile?: string;
  numberOfRetries?: number;
  options?: ConnectOptions;
};

export type PublishParameters = Omit<PublishPacket, "type" | "id">;
export type SubscribeParameters = Omit<SubscribePacket, "type" | "id">;

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

export const DEFAULTURL = "mqtt://localhost:1883/";

enum ConnectionState {
  offline = "offline",
  connecting = "connecting",
  connected = "connected",
  disconnecting = "disconnecting",
  disconnected = "disconnected",
}

export class Client {
  protected clientIdPrefix = "opifex";
  private url: URL;
  private certFile?: string;
  private numberOfRetries: number;
  private clientId: string;
  private connectionState: ConnectionState;
  private mqttConn?: MqttConn;
  private debug: Function;
  private pingTimer?: Timer;
  private keepAlive = 60000;
  private unresolvedConnect?: Deferred<ConnackPacket>;
  onopen = () => {};
  onconnect = () => {};
  onmessage = (message: PublishPacket) => {};
  onclose = () => {};
  onerror = (err: Error) => {};

  constructor(logger?: Function) {
    this.connectionState = ConnectionState.offline;
    this.url = new URL(DEFAULTURL);
    this.clientId = generateClientId(this.clientIdPrefix);
    this.numberOfRetries = 3; // Infinity;
    this.debug = logger || (() => {});
  }

  private doClose() {
    this.connectionState = ConnectionState.disconnected;
    this.pingTimer?.clear();
    this.onclose();
  }

  private async connectMQTT(hostname: string, port = 1883) {
    this.debug({ hostname, port });
    return await Deno.connect({ hostname, port });
  }

  private async connectMQTTS(
    hostname: string,
    port = 8883,
    caCerts?: string[],
  ) {
    this.debug({ hostname, port, caCerts });
    return await Deno.connectTls({ hostname, port, caCerts });
  }

  protected async createConn(
    protocol: string,
    hostname: string,
    port?: number,
    caCerts?: string[],
  ): Promise<Deno.Conn> {
    // if you need to support alternative connection types just
    // overload this method in your subclass
    if (protocol === "mqtts:") {
      return this.connectMQTTS(hostname, port, caCerts);
    }
    if (protocol === "mqtt:") {
      return this.connectMQTT(hostname, port);
    }
    throw `Unsupported protocol: ${protocol}`;
  }

  private async doConnect(
    packet: ConnectPacket,
    numberOfRetries: number,
    url: URL,
    caCerts?: string[],
  ): Promise<void> {
    let ipConnected = false;
    let attempt = 0;
    let lastMessage = "";
    while ((ipConnected === false) && (attempt < numberOfRetries)) {
      try {
        const conn = await this.createConn(
          url.protocol,
          url.hostname,
          Number(url.port) || undefined,
          caCerts,
        );
        this.mqttConn = new MqttConn({ conn });
        this.handleConnection(this.mqttConn);
        await this.mqttConn.send(packet);
        ipConnected = true;
        this.onopen();
      } catch (err) {
        lastMessage = `Connection failed: ${err.message}`;
        this.debug(lastMessage);
        await backOffSleep(true, attempt++);
      }
    }
    if (ipConnected === false) {
      this.unresolvedConnect?.reject(Error(lastMessage));
      this.onerror(Error(lastMessage));
    }
  }

  connect(
    params: ConnectParameters = {},
  ): Promise<ConnackPacket> {
    this.url = params.url ? new URL(params.url) : this.url;
    this.certFile = params?.certFile;
    const packet: ConnectPacket = {
      clientId: this.clientId,
      type: PacketType.connect,
      ...params?.options,
    };
    this.numberOfRetries = params.numberOfRetries || this.numberOfRetries;
    const deferred = new Deferred<ConnackPacket>();
    this.unresolvedConnect = deferred;
    this.doConnect(packet, this.numberOfRetries, this.url);
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
    this.doClose();
  }

  async publish(params: PublishParameters): Promise<void> {
    const packet: PublishPacket = {
      type: PacketType.publish,
      id: 1,
      ...params,
    };
    await this.sendPacket(packet);
  }

  async subscribe(params: SubscribeParameters): Promise<void> {}

  private async sendPacket(packet: AnyPacket) {
    console.log({ sendPacket: packet });
    if (this.connectionState === ConnectionState.connected) {
      await this.mqttConn?.send(packet);
      this.pingTimer?.reset();
      return;
    }
    console.log("not connected");
    this.pingTimer?.clear();
  }

  private sendPing() {
    this.sendPacket({ type: PacketType.pingreq });
  }

  private async handleConnection(mqttConn: MqttConn): Promise<void> {
    if (mqttConn === undefined) {
      return;
    }
    try {
      for await (const packet of mqttConn) {
        this.debug({ received: JSON.stringify(packet, null, 2) });
        if (this.connectionState !== ConnectionState.connected) {
          if (packet.type === PacketType.connack) {
            this.connectionState = ConnectionState.connected;
            this.pingTimer = new Timer(
              this.sendPing.bind(this),
              this.keepAlive,
            );
            this.unresolvedConnect?.resolve(packet);
            this.onconnect();
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
              this.onmessage(packet);
              break;
            case PacketType.pingres:
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
      this.doClose();
    }
  }
}
