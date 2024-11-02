import {
  A as AuthenticationResult,
  a as assert,
  c as PacketNameByType,
  l as logger,
  M as MqttConn,
  P as PacketType,
  T as Timer,
} from "../timer-DDWVNsyG.js";
import "node:process";

class Trie {
  #value;
  #children;
  separator = "/";
  wildcardOne = "+";
  wildcardSubtree = "#";
  reservedPrefix = "$";
  looseCompare;
  constructor(looseCompare = false) {
    this.#value = [];
    this.#children = /* @__PURE__ */ new Map();
    this.looseCompare = looseCompare;
  }
  matchChild(child, parts) {
    const childNode = this.#children.get(child);
    return childNode ? childNode._match(parts) : [];
  }
  match(key) {
    const parts = key.split(this.separator);
    if (parts.length > 0 && parts[0].charAt(0) === this.reservedPrefix) {
      return this._matchPrefix(parts);
    }
    return this._match(parts);
  }
  _matchPrefix(parts) {
    if (parts.length === 0) {
      return this.#value ? this.#value : [];
    }
    const [first, ...rest] = parts;
    return this.matchChild(first, rest);
  }
  _match(parts) {
    if (parts.length === 0) {
      return this.#value ? this.#value : [];
    }
    const [first, ...rest] = parts;
    const exact = this.matchChild(first, rest);
    const single = this.matchChild(this.wildcardOne, rest);
    const subtree = this.matchChild(this.wildcardSubtree, []);
    const results = exact.concat(single, subtree);
    return results;
  }
  add(key, value) {
    return this._add(key.split(this.separator), value);
  }
  _add(parts, value) {
    if (parts.length === 0) {
      this.#value = this.#value.concat(value);
      return;
    }
    const [first, ...rest] = parts;
    const child = this.#children.get(first);
    if (child instanceof Trie) {
      child._add(rest, value);
    } else {
      const node = new Trie(this.looseCompare);
      this.#children.set(first, node);
      node._add(rest, value);
    }
    return;
  }
  remove(key, value) {
    return this._remove(key.split(this.separator), value);
  }
  _remove(parts, value) {
    if (parts.length === 0) {
      const arr = this.#value || [];
      this.#value = arr.filter(this.filter(value));
      return;
    }
    const [first, ...rest] = parts;
    const node = this.#children.get(first);
    if (node) {
      node._remove(rest, value);
      if (node.#value.length === 0 && this.#children.size === 0) {
        this.#children.delete(first);
      }
    }
  }
  filter(value) {
    if (this.looseCompare && typeof value === "object") {
      return (item) => {
        for (const key in value) {
          if (value[key] !== item[key]) {
            return true;
          }
        }
        return false;
      };
    }
    return (item) => item !== value;
  }
}

const maxPacketId = 65535;
class MemoryStore {
  clientId;
  packetId;
  pendingIncoming;
  pendingOutgoing;
  pendingAckOutgoing;
  subscriptions;
  constructor(clientId) {
    this.packetId = 0;
    this.pendingIncoming = /* @__PURE__ */ new Map();
    this.pendingOutgoing = /* @__PURE__ */ new Map();
    this.pendingAckOutgoing = /* @__PURE__ */ new Set();
    this.subscriptions = /* @__PURE__ */ new Map();
    this.clientId = clientId;
  }
  nextId() {
    const currentId = this.packetId;
    do {
      this.packetId++;
      if (this.packetId > maxPacketId) {
        this.packetId = 0;
      }
    } while (
      (this.pendingOutgoing.has(this.packetId) ||
        this.pendingAckOutgoing.has(this.packetId)) &&
      this.packetId !== currentId
    );
    assert(this.packetId !== currentId, "No unused packetId available");
    return this.packetId;
  }
}
class MemoryPersistence {
  clientList;
  retained;
  trie;
  constructor() {
    this.clientList = /* @__PURE__ */ new Map();
    this.retained = /* @__PURE__ */ new Map();
    this.trie = new Trie(true);
  }
  registerClient(clientId, handler, clean) {
    const existingClient = this.clientList.get(clientId);
    const store = !clean && existingClient
      ? existingClient.store
      : new MemoryStore(clientId);
    this.clientList.set(clientId, { store, handler });
    return store;
  }
  deregisterClient(clientId) {
    const client = this.clientList.get(clientId);
    if (client) {
      this.unsubscribeAll(client.store);
      this.clientList.delete(clientId);
    }
  }
  subscribe(store, topicFilter, qos) {
    const clientId = store.clientId;
    if (!store.subscriptions.has(topicFilter)) {
      store.subscriptions.set(topicFilter, qos);
      this.trie.add(topicFilter, { clientId, qos });
    }
  }
  unsubscribe(store, topicFilter) {
    const clientId = store.clientId;
    const qos = store.subscriptions.get(topicFilter);
    if (qos) {
      store.subscriptions.delete(topicFilter);
      this.trie.remove(topicFilter, { clientId, qos });
    }
  }
  unsubscribeAll(store) {
    for (const [topicFilter, _qos] of store.subscriptions) {
      this.unsubscribe(store, topicFilter);
    }
  }
  publish(topic, packet) {
    if (packet.retain) {
      this.retained.set(packet.topic, packet);
      if (packet.payload === void 0) {
        this.retained.delete(packet.topic);
      }
    }
    const clients = /* @__PURE__ */ new Map();
    for (const { clientId, qos } of this.trie.match(topic)) {
      const prevQos = clients.get(clientId);
      if (!prevQos || prevQos < qos) {
        clients.set(clientId, qos);
      }
    }
    for (const [clientId, qos] of clients) {
      const newPacket = Object.assign({}, packet);
      newPacket.retain = false;
      newPacket.qos = qos;
      const client = this.clientList.get(clientId);
      client?.handler(packet);
    }
  }
  handleRetained(clientId) {
    const retainedTrie = new Trie();
    const client = this.clientList.get(clientId);
    const store = client?.store;
    if (store) {
      for (const [topicFilter, _qos] of store.subscriptions) {
        retainedTrie.add(topicFilter, clientId);
      }
      for (const [topic, packet] of this.retained) {
        if (retainedTrie.match(topic).length > 0) {
          client?.handler(packet);
        }
      }
    }
  }
}

const SysPrefix = "$";
const utf8Encoder = new TextEncoder();
class Context {
  connected;
  conn;
  mqttConn;
  persistence;
  handlers;
  static clientList = /* @__PURE__ */ new Map();
  store;
  will;
  timer;
  constructor(persistence, conn, handlers) {
    this.persistence = persistence;
    this.connected = false;
    this.conn = conn;
    this.mqttConn = new MqttConn({ conn });
    this.handlers = handlers;
  }
  async send(packet) {
    logger.debug("Sending", PacketNameByType[packet.type]);
    logger.debug(JSON.stringify(packet, null, 2));
    await this.mqttConn.send(packet);
  }
  connect(clientId, clean) {
    logger.debug("Connecting", clientId);
    const existingSession = Context.clientList.get(clientId);
    if (existingSession) {
      existingSession.close(false);
    }
    this.store = this.persistence.registerClient(
      clientId,
      this.doPublish.bind(this),
      clean,
    );
    this.connected = true;
    this.broadcast("$SYS/connect/clients", clientId);
    logger.debug("Connected", clientId);
  }
  doPublish(packet) {
    const qos = packet.qos || 0;
    if (qos === 0) {
      packet.id = 0;
      this.send(packet);
      return;
    }
    if (this.store) {
      packet.id = this.store.nextId();
      this.store.pendingOutgoing.set(packet.id, packet);
      this.send(packet);
    }
  }
  clean(clientId) {
    this.persistence.deregisterClient(clientId);
  }
  close(executewill = true) {
    if (this.connected) {
      logger.debug(
        `Closing ${this.store?.clientId} while mqttConn is ${
          this.mqttConn.isClosed ? "" : "not "
        }closed`,
      );
      this.connected = false;
      if (typeof this.timer === "object") {
        this.timer.clear();
      }
      if (this.store) {
        this.broadcast("$SYS/disconnect/clients", this.store.clientId);
      }
      if (executewill) {
        this.handleWill();
      }
    }
    if (!this.mqttConn.isClosed) {
      this.mqttConn.close();
    }
  }
  handleWill() {
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
  broadcast(topic, payload, retain = false) {
    const packet = {
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

function isAuthenticated(ctx, packet) {
  if (ctx.handlers.isAuthenticated) {
    return ctx.handlers.isAuthenticated(
      ctx,
      packet.clientId || "",
      packet.username || "",
      packet.password || new Uint8Array(0),
    );
  }
  return AuthenticationResult.ok;
}
function validateConnect(ctx, packet) {
  if (packet.protocolLevel !== 4) {
    return AuthenticationResult.unacceptableProtocol;
  }
  return isAuthenticated(ctx, packet);
}
function handleConnect(ctx, packet) {
  const clientId = packet.clientId || `Opifex-${crypto.randomUUID()}`;
  const returnCode = validateConnect(ctx, packet);
  if (returnCode === AuthenticationResult.ok) {
    if (packet.will) {
      ctx.will = {
        type: PacketType.publish,
        qos: packet.will.qos,
        retain: packet.will.retain,
        topic: packet.will.topic,
        payload: packet.will.payload,
      };
    }
    ctx.connect(clientId, packet.clean || false);
    const keepAlive = packet.keepAlive || 0;
    if (keepAlive > 0) {
      logger.debug(`Setting keepalive to ${keepAlive * 1500} ms`);
      ctx.timer = new Timer(() => {
        ctx.close();
      }, Math.floor(keepAlive * 1500));
    }
  }
  const sessionPresent = false;
  ctx.send({
    type: PacketType.connack,
    sessionPresent,
    returnCode,
  });
  if (returnCode !== AuthenticationResult.ok) {
    ctx.close();
  }
}

async function handlePingreq(ctx) {
  await ctx.send({
    type: PacketType.pingres,
  });
}

function authorizedToPublish(ctx, topic) {
  if (topic.startsWith(SysPrefix)) {
    return false;
  }
  if (ctx.handlers.isAuthorizedToPublish) {
    return ctx.handlers.isAuthorizedToPublish(ctx, topic);
  }
  return true;
}
async function handlePublish(ctx, packet) {
  if (!authorizedToPublish(ctx, packet.topic)) {
    return;
  }
  const qos = packet.qos || 0;
  if (qos === 0) {
    ctx.persistence.publish(packet.topic, packet);
    return;
  }
  if (packet.id !== void 0) {
    if (qos === 1) {
      ctx.persistence.publish(packet.topic, packet);
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
  if (ctx.store?.pendingOutgoing.has(id)) {
    ctx.store.pendingOutgoing.delete(id);
  }
}

async function handlePubrec(ctx, packet) {
  const id = packet.id;
  if (ctx.store?.pendingOutgoing.has(id)) {
    ctx.store.pendingOutgoing.delete(id);
    ctx.store.pendingAckOutgoing.add(id);
    await ctx.send({
      type: PacketType.pubrel,
      id,
    });
  }
}

async function handlePubrel(ctx, packet) {
  const id = packet.id;
  if (ctx.store?.pendingIncoming.has(id)) {
    const storedPacket = ctx.store.pendingIncoming.get(id);
    if (storedPacket) {
      ctx.persistence.publish(storedPacket.topic, storedPacket);
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
  if (ctx.store?.pendingAckOutgoing.has(id)) {
    ctx.store.pendingAckOutgoing.delete(id);
  }
}

const SubscriptionFailure = 128;
function authorizedToSubscribe(ctx, topicFilter) {
  if (ctx.handlers.isAuthorizedToSubscribe) {
    return ctx.handlers.isAuthorizedToSubscribe(ctx, topicFilter);
  }
  return true;
}
async function handleSubscribe(ctx, packet) {
  const returnCodes = packet.subscriptions.map((sub) => {
    if (ctx.store) {
      if (!authorizedToSubscribe(ctx, sub.topicFilter)) {
        return SubscriptionFailure;
      }
      ctx.persistence.subscribe(ctx.store, sub.topicFilter, sub.qos);
      return sub.qos;
    }
    return SubscriptionFailure;
  });
  await ctx.send({
    type: PacketType.suback,
    id: packet.id,
    returnCodes,
  });
  if (ctx.store) {
    ctx.persistence.handleRetained(ctx.store.clientId);
  }
}

async function handleUnsubscribe(ctx, packet) {
  for (const topic of packet.topicFilters) {
    if (ctx.store) {
      ctx.persistence.unsubscribe(ctx.store, topic);
    }
  }
  await ctx.send({
    type: PacketType.unsuback,
    id: packet.id,
  });
}

function handleDisconnect(ctx) {
  ctx.will = void 0;
  ctx.close();
}

async function handlePacket(ctx, packet) {
  logger.debug("handling", PacketNameByType[packet.type]);
  logger.debug(JSON.stringify(packet, null, 2));
  if (!ctx.connected) {
    if (packet.type === PacketType.connect) {
      handleConnect(ctx, packet);
    } else {
      throw new Error(
        `Received ${PacketNameByType[packet.type]} packet before connect`,
      );
    }
  } else {
    switch (packet.type) {
      case PacketType.pingreq:
        await handlePingreq(ctx);
        break;
      case PacketType.publish:
        await handlePublish(ctx, packet);
        break;
      case PacketType.puback:
        handlePuback(ctx, packet);
        break;
      case PacketType.pubrel:
        await handlePubrel(ctx, packet);
        break;
      case PacketType.pubrec:
        await handlePubrec(ctx, packet);
        break;
      case PacketType.pubcomp:
        handlePubcomp(ctx, packet);
        break;
      case PacketType.subscribe:
        await handleSubscribe(ctx, packet);
        break;
      case PacketType.unsubscribe:
        await handleUnsubscribe(ctx, packet);
        break;
      case PacketType.disconnect:
        handleDisconnect(ctx);
        break;
      default:
        throw new Error(
          `Received unexpected ${
            PacketNameByType[packet.type]
          } packet after connect`,
        );
    }
    ctx.timer?.reset();
  }
}

const defaultIsAuthenticated = (_ctx, _clientId, _username, _password) =>
  AuthenticationResult.ok;
const defaultIsAuthorized = (_ctx, _topic) => true;
class MqttServer {
  handlers;
  persistence;
  constructor({
    persistence,
    handlers,
  }) {
    this.persistence = persistence || new MemoryPersistence();
    this.handlers = {
      isAuthenticated: handlers?.isAuthenticated || defaultIsAuthenticated,
      isAuthorizedToPublish: handlers?.isAuthorizedToPublish ||
        defaultIsAuthorized,
      isAuthorizedToSubscribe: handlers?.isAuthorizedToSubscribe ||
        defaultIsAuthorized,
    };
  }
  async serve(conn) {
    const ctx = new Context(this.persistence, conn, this.handlers);
    if (conn.remoteAddr?.transport === "tcp") {
      logger.debug(`socket connected from ${conn.remoteAddr.hostname}`);
    }
    try {
      for await (const packet of ctx.mqttConn) {
        handlePacket(ctx, packet);
      }
    } catch (err) {
      logger.debug(`Error while serving:${err}`);
    } finally {
      ctx.close();
    }
  }
}

export { AuthenticationResult, Context, MqttServer };
