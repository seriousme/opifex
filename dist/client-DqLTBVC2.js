import {
  a as assert,
  b as AuthenticationResultByNumber,
  c as PacketNameByType,
  l as logger,
  M as MqttConn,
  P as PacketType,
  T as Timer,
} from "./timer-DDWVNsyG.js";
import "node:process";

class Deferred {
  promise;
  resolve;
  reject;
  constructor() {
    this.promise = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}

function nextTick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

class AsyncQueue {
  queue = [];
  maxQueueLength = Infinity;
  nextResolve = (_value) => {
  };
  nextReject = (_reason) => {
  };
  done = false;
  hasNext = false;
  constructor(maxQueueLength) {
    if (maxQueueLength) {
      this.maxQueueLength = maxQueueLength;
    }
  }
  async next() {
    await nextTick();
    if (this.done && this.queue.length === 0) {
      return Promise.reject("Closed");
    }
    return new Promise((resolve, reject) => {
      if (this.queue.length > 0) {
        const item = this.queue.shift();
        if (item) {
          return resolve(item);
        }
      }
      this.nextResolve = resolve;
      this.nextReject = reject;
      this.hasNext = true;
    });
  }
  close(reason = "closed") {
    this.done = true;
    if (this.hasNext) {
      this.nextReject(reason);
    }
  }
  async *[Symbol.asyncIterator]() {
    while (true) {
      yield this.next();
    }
  }
  push(item) {
    if (this.hasNext) {
      this.nextResolve(item);
      this.hasNext = false;
      return;
    }
    if (this.queue.length > this.maxQueueLength) {
      this.queue.shift();
    }
    this.queue.push(item);
  }
  get isDone() {
    return this.done;
  }
}

const maxPacketId = 65535;

class MemoryStore {
  packetId;
  pendingIncoming;
  pendingOutgoing;
  pendingAckOutgoing;
  constructor() {
    this.packetId = 0;
    this.pendingIncoming = /* @__PURE__ */ new Map();
    this.pendingOutgoing = /* @__PURE__ */ new Map();
    this.pendingAckOutgoing = /* @__PURE__ */ new Map();
  }
  nextId() {
    const currentId = this.packetId;
    do {
      this.packetId++;
      if (this.packetId > maxPacketId) {
        this.packetId = 1;
      }
    } while (
      (this.pendingIncoming.has(this.packetId) ||
        this.pendingOutgoing.has(this.packetId) ||
        this.pendingAckOutgoing.has(this.packetId)) &&
      this.packetId !== currentId
    );
    assert(this.packetId !== currentId, "No unused packetId available");
    return this.packetId;
  }
  async *pendingOutgoingPackets() {
    for (const [_id, packet] of this.pendingAckOutgoing) {
      yield packet;
    }
    for (const [_id, packet] of this.pendingOutgoing) {
      yield packet;
    }
  }
}

const ConnectionState = {
  offline: "offline",
  connecting: "connecting",
  connected: "connected",
  disconnecting: "disconnecting",
  disconnected: "disconnected",
};

async function handleConnack(packet, ctx) {
  if (packet.returnCode === 0) {
    ctx.connectionState = ConnectionState.connected;
    ctx.pingTimer?.reset();
    ctx.unresolvedConnect?.resolve(packet.returnCode);
    for await (const packet2 of ctx.store.pendingOutgoingPackets()) {
      ctx.send(packet2);
    }
    return;
  }
  const err = new Error(
    `Connect failed: ${AuthenticationResultByNumber[packet.returnCode]}`,
  );
  ctx.connectionState = ConnectionState.disconnecting;
  ctx.pingTimer?.clear();
  ctx.unresolvedConnect?.reject(err);
}

async function handlePublish(ctx, packet) {
  const qos = packet.qos || 0;
  if (qos === 0) {
    ctx.receivePublish(packet);
    return;
  }
  if (packet.id !== void 0) {
    if (qos === 1) {
      ctx.receivePublish(packet);
      await ctx.send({
        type: PacketType.puback,
        id: packet.id,
      });
      return;
    }
    if (ctx.store) {
      ctx.store.pendingIncoming.set(packet.id, packet);
      await ctx.send({
        type: PacketType.pubrec,
        id: packet.id,
      });
    }
  }
}

function handlePuback(ctx, packet) {
  const id = packet.id;
  ctx.store.pendingOutgoing.delete(id);
  ctx.receivePuback(id);
}

async function handlePubrec(ctx, packet) {
  const id = packet.id;
  const ack = {
    type: PacketType.pubrel,
    id,
  };
  if (ctx.store.pendingOutgoing.has(id)) {
    ctx.store.pendingAckOutgoing.set(id, ack);
    ctx.store.pendingOutgoing.delete(id);
    await ctx.send(ack);
  }
}

async function handlePubrel(ctx, packet) {
  const id = packet.id;
  if (ctx.store.pendingIncoming.has(id)) {
    const storedPacket = ctx.store.pendingIncoming.get(id);
    if (storedPacket) {
      ctx.receivePublish(storedPacket);
      ctx.store.pendingIncoming.delete(id);
      await ctx.send({
        type: PacketType.pubcomp,
        id,
      });
    }
  }
}

function handlePubcomp(ctx, packet) {
  const id = packet.id;
  if (ctx.store.pendingAckOutgoing.has(id)) {
    ctx.store.pendingAckOutgoing.delete(id);
    ctx.receivePuback(id);
  }
}

function handleSuback(ctx, packet) {
  const id = packet.id;
  ctx.store.pendingOutgoing.delete(id);
  ctx.receiveSuback(id, packet.returnCodes);
}

function handleUnsuback(ctx, packet) {
  const id = packet.id;
  ctx.store.pendingOutgoing.delete(id);
  ctx.receiveUnsuback(id);
}

async function handlePacket(ctx, packet) {
  logger.debug({ received: JSON.stringify(packet, null, 2) });
  if (ctx.connectionState !== ConnectionState.connected) {
    if (packet.type === PacketType.connack) {
      handleConnack(packet, ctx);
    } else {
      throw new Error(
        `Received ${PacketNameByType[packet.type]} packet before connect`,
      );
    }
  } else {
    switch (packet.type) {
      case PacketType.pingres:
        break;
      case PacketType.publish:
        await handlePublish(ctx, packet);
        break;
      case PacketType.puback:
        await handlePuback(ctx, packet);
        break;
      case PacketType.pubrel:
        await handlePubrel(ctx, packet);
        break;
      case PacketType.pubrec:
        await handlePubrec(ctx, packet);
        break;
      case PacketType.pubcomp:
        await handlePubcomp(ctx, packet);
        break;
      case PacketType.suback:
        await handleSuback(ctx, packet);
        break;
      case PacketType.unsuback:
        handleUnsuback(ctx, packet);
        break;
      default:
        throw new Error(
          `Received unexpected ${
            PacketNameByType[packet.type]
          } packet after connect`,
        );
    }
  }
}

class Context {
  mqttConn;
  connectionState;
  pingTimer;
  unresolvedConnect;
  unresolvedPublish;
  unresolvedSubscribe;
  unresolvedUnSubscribe;
  store;
  incoming;
  constructor(store) {
    this.store = store;
    this.connectionState = ConnectionState.offline;
    this.incoming = new AsyncQueue();
    this.unresolvedPublish = /* @__PURE__ */ new Map();
    this.unresolvedSubscribe = /* @__PURE__ */ new Map();
    this.unresolvedUnSubscribe = /* @__PURE__ */ new Map();
  }
  async connect(packet) {
    this.connectionState = ConnectionState.connecting;
    await this.mqttConn?.send(packet);
    const keepAlive = packet.keepAlive || 0;
    if (keepAlive > 0) {
      this.pingTimer = new Timer(
        this.sendPing.bind(this),
        keepAlive * 1e3,
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
  async send(packet) {
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
  async handleConnection(conn, connectPacket) {
    this.mqttConn = new MqttConn({ conn });
    if (this.mqttConn === void 0) {
      return true;
    }
    await this.connect(connectPacket);
    try {
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
  receivePublish(packet) {
    this.incoming.push(packet);
  }
  publish(packet) {
    const qos = packet.qos || 0;
    if (qos === 0) {
      packet.id = 0;
      this.send(packet);
      return Promise.resolve();
    }
    packet.id = this.store.nextId();
    this.store.pendingOutgoing.set(packet.id, packet);
    const deferred = new Deferred();
    this.unresolvedPublish.set(packet.id, deferred);
    this.send(packet);
    return deferred.promise;
  }
  subscribe(packet) {
    packet.id = this.store.nextId();
    this.store.pendingOutgoing.set(packet.id, packet);
    const deferred = new Deferred();
    this.unresolvedSubscribe.set(packet.id, deferred);
    this.send(packet);
    return deferred.promise;
  }
  unsubscribe(packet) {
    packet.id = this.store.nextId();
    this.store.pendingOutgoing.set(packet.id, packet);
    const deferred = new Deferred();
    this.unresolvedUnSubscribe.set(packet.id, deferred);
    this.send(packet);
    return deferred.promise;
  }
  receivePuback(id) {
    const unresolvedMap = this.unresolvedPublish;
    if (unresolvedMap.has(id)) {
      const deferred = unresolvedMap.get(id);
      unresolvedMap.delete(id);
      deferred?.resolve();
      return true;
    }
    return false;
  }
  receiveSuback(id, returnCodes) {
    const unresolvedMap = this.unresolvedSubscribe;
    if (unresolvedMap.has(id)) {
      const deferred = unresolvedMap.get(id);
      unresolvedMap.delete(id);
      deferred?.resolve(returnCodes);
      return true;
    }
    return false;
  }
  receiveUnsuback(id) {
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

function generateClientId(prefix) {
  return `${prefix}-${Math.random().toString().slice(-10)}`;
}
function backOffSleep(random, attempt) {
  const factor = 1.5;
  const min = 1e3;
  const max = 5e3;
  const randomness = 1 + (Math.random());
  const delay = Math.floor(
    Math.min(randomness * min * factor ** attempt, max),
  );
  logger.debug({ delay });
  return new Promise((resolve) => setTimeout(resolve, delay));
}
const DEFAULT_URL = "mqtt://localhost:1883/";
const DEFAULT_KEEPALIVE = 60;
const DEFAULT_RETRIES = 3;
const CLIENTID_PREFIX = "opifex";
class Client {
  clientIdPrefix = CLIENTID_PREFIX;
  numberOfRetries = DEFAULT_RETRIES;
  url = new URL(DEFAULT_URL);
  keepAlive = DEFAULT_KEEPALIVE;
  autoReconnect = true;
  caCerts;
  clientId;
  ctx = new Context(new MemoryStore());
  connectPacket;
  constructor() {
    this.clientId = generateClientId(this.clientIdPrefix);
    this.numberOfRetries = DEFAULT_RETRIES;
  }
  createConn(protocol, _hostname, _port, _caCerts) {
    throw `Unsupported protocol: ${protocol}`;
  }
  async doConnect() {
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
          Number(this.url.port) ?? void 0,
          this.caCerts,
        );
        tryConnect =
          await this.ctx.handleConnection(conn, this.connectPacket) &&
          this.autoReconnect;
        logger.debug({ tryConnect });
        isReconnect = true;
        this.connectPacket.clean = false;
        this.ctx.close();
      } catch (err) {
        if (err instanceof Error) {
          lastMessage = `Connection failed: ${err.message}`;
        }
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
  connect(params = {}) {
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
    const deferred = new Deferred();
    this.ctx.unresolvedConnect = deferred;
    this.doConnect();
    return deferred.promise;
  }
  async disconnect() {
    await this.ctx.disconnect();
  }
  async publish(params) {
    const packet = {
      type: PacketType.publish,
      ...params,
    };
    await this.ctx.send(packet);
  }
  async subscribe(params) {
    const packet = {
      type: PacketType.subscribe,
      id: this.ctx.store.nextId(),
      ...params,
    };
    await this.ctx.send(packet);
  }
  async *messages() {
    yield* this.ctx.incoming;
  }
}

export { Client as C, DEFAULT_URL as D };
