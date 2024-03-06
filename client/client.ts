import {
  AuthenticationResult,
  ConnectPacket,
  Deferred,
  logger,
  MemoryStore,
  PacketType,
  PublishPacket,
  SockConn,
  SubscribePacket,
} from "./deps.ts";

import { Context } from "./context.ts";

function generateClientId(prefix: string): string {
  return `${prefix}-${Math.random().toString().slice(-10)}`;
}

type ConnectOptions = Omit<
  ConnectPacket,
  "type" | "protocolName" | "protocolLevel"
>;
export type ConnectParameters = {
  url?: URL;
  caCerts?: string[];
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
    Math.min(randomness * min * (factor ** attempt), max),
  );
  logger.debug({ delay });
  return new Promise((resolve) => setTimeout(resolve, delay));
}

export const DEFAULT_URL = "mqtt://localhost:1883/";
const DEFAULT_KEEPALIVE = 60; // 60 seconds
const DEFAULT_RETRIES = 3; // on first connect
const CLIENTID_PREFIX = "opifex"; // on first connect

export class Client {
  protected clientIdPrefix = CLIENTID_PREFIX;
  protected numberOfRetries = DEFAULT_RETRIES;
  protected url: URL = new URL(DEFAULT_URL);
  protected keepAlive = DEFAULT_KEEPALIVE;
  protected autoReconnect = true;
  private caCerts?: string[];
  private clientId: string;
  private ctx = new Context(new MemoryStore());
  private connectPacket?: ConnectPacket;

  constructor() {
    this.clientId = generateClientId(this.clientIdPrefix);
    this.numberOfRetries = DEFAULT_RETRIES;
  }

  protected createConn(
    protocol: string,
    _hostname: string,
    _port?: number,
    _caCerts?: string[],
  ): Promise<SockConn> {
    // if you need to support alternative connection types just
    // overload this method in your subclass
    throw `Unsupported protocol: ${protocol}`;
  }

  private async doConnect(): Promise<void> {
    if (!this.connectPacket) {
      return;
    }
    let isReconnect = false;
    let attempt = 1;
    let lastMessage = "";
    let tryConnect = true;
    while (tryConnect) {
      logger.debug(`${isReconnect ? "re" : ""}connecting`);
      try {
        const conn = await this.createConn(
          this.url.protocol,
          this.url.hostname,
          Number(this.url.port) || undefined,
          this.caCerts,
        );
        // if we get this far we have a connection
        tryConnect =
          (await this.ctx.handleConnection(conn, this.connectPacket)) &&
          this.autoReconnect;
        logger.debug({ tryConnect });
        isReconnect = true;
        this.connectPacket.clean = false;
        this.ctx.close();
      } catch (err) {
        lastMessage = `Connection failed: ${err.message}`;
        logger.debug(lastMessage);
        if (!isReconnect && attempt > this.numberOfRetries) {
          tryConnect = false;
        } else {
          await backOffSleep(true, attempt++);
        }
      }
    }

    if (isReconnect === false) {
      this.ctx.unresolvedConnect?.reject(Error(lastMessage));
    }
  }

  connect(params: ConnectParameters = {}): Promise<AuthenticationResult> {
    this.url = params?.url || this.url;
    this.numberOfRetries = params.numberOfRetries || this.numberOfRetries;
    this.caCerts = params?.caCerts;
    const options = Object.assign(
      {
        keepAlive: this.keepAlive,
        clientId: this.clientId,
      },
      params?.options,
    );
    this.connectPacket = {
      type: PacketType.connect,
      ...options,
    };
    const deferred = new Deferred<AuthenticationResult>();
    this.ctx.unresolvedConnect = deferred;
    this.doConnect();
    return deferred.promise;
  }

  async disconnect(): Promise<void> {
    await this.ctx.disconnect();
  }

  async publish(params: PublishParameters): Promise<void> {
    const packet: PublishPacket = {
      type: PacketType.publish,
      ...params,
    };
    await this.ctx.send(packet);
  }

  async subscribe(params: SubscribeParameters): Promise<void> {
    const packet: SubscribePacket = {
      type: PacketType.subscribe,
      id: this.ctx.store.nextId(),
      ...params,
    };
    await this.ctx.send(packet);
  }

  async *messages(): AsyncGenerator<PublishPacket, void, unknown> {
    yield* this.ctx.incoming;
  }
}
