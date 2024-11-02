import "node:process";

const PacketType = {
  reserved: 0,
  connect: 1,
  connack: 2,
  publish: 3,
  puback: 4,
  pubrec: 5,
  pubrel: 6,
  pubcomp: 7,
  subscribe: 8,
  suback: 9,
  unsubscribe: 10,
  unsuback: 11,
  pingreq: 12,
  pingres: 13,
  disconnect: 14,
};
const PacketNameByType = Object.fromEntries(
  Object.entries(PacketType).map(([k, v]) => [v, k]),
);

const invalidTopicRegEx = new RegExp(/^$|\+|#|\x00|\uFFFD/);
const invalidTopicFilterRegEx = new RegExp(/^$|#.|[^\/]\+|\+[^\/]|\x00|\uFFFD/);
function invalidTopic(value) {
  return invalidTopicRegEx.test(value);
}
function invalidTopicFilter(value) {
  return invalidTopicFilterRegEx.test(value);
}

function encodeLength(n) {
  const output = [];
  let x = n;
  do {
    let encodedByte = x % 128;
    x = Math.floor(x / 128);
    if (x > 0) {
      encodedByte = encodedByte | 128;
    }
    output.push(encodedByte);
  } while (x > 0);
  if (output.length > 4) {
    throw Error("length encoding failed");
  }
  return output;
}
function getLengthDecoder() {
  let numLengthBytes = 1;
  let length = 0;
  let multiplier = 1;
  return function addLengthByte(encodedByte) {
    length += (encodedByte & 127) * multiplier;
    multiplier *= 128;
    if ((encodedByte & 128) === 0) {
      return { done: true, length, numLengthBytes };
    }
    if (numLengthBytes++ >= 4) {
      throw Error("length decoding failed");
    }
    return { done: false, length, numLengthBytes };
  };
}

const BitMask = {
  bit0: 2 ** 0,
  bit1: 2 ** 1,
  bit2: 2 ** 2,
  bit3: 2 ** 3,
  bit4: 2 ** 4,
  bit5: 2 ** 5,
  bit6: 2 ** 6,
  bit7: 2 ** 7,
};

const utf8Encoder = new TextEncoder();
class EncoderError extends Error {
  constructor(message) {
    super(message);
    this.name = "EncoderError";
  }
}
class Encoder {
  buffer;
  constructor() {
    this.buffer = [];
  }
  setByte(value) {
    this.buffer.push(value);
    return this;
  }
  setInt16(value) {
    this.setByte(value >> 8);
    this.setByte(value & 255);
    return this;
  }
  setByteArray(value) {
    if (value.length > 65535) {
      throw new EncoderError("More than 0xffff bytes of data");
    }
    this.setInt16(value.length);
    this.buffer.push(...value);
    return this;
  }
  setUtf8String(value) {
    this.setByteArray(utf8Encoder.encode(value));
    return this;
  }
  setTopic(value) {
    if (invalidTopic(value)) {
      throw new EncoderError(
        "Topic must contain valid UTF-8 and contain more than 1 byte and no wildcards",
      );
    }
    this.setUtf8String(value);
    return this;
  }
  setTopicFilter(value) {
    if (invalidTopicFilter(value)) {
      throw new EncoderError(
        "Topicfilter must contain valid UTF-8 and contain more than 1 byte and valid wildcards",
      );
    }
    this.setUtf8String(value);
    return this;
  }
  setRemainder(value) {
    this.buffer.push(...value);
    return this;
  }
  done() {
    return this.buffer;
  }
}

const utf8Decoder = new TextDecoder("utf-8");
function booleanFlag(byte, mask) {
  return !!(byte & mask);
}
function isEmptyBuf(buf) {
  if (buf.length > 0) {
    throw new DecoderError("Packet too long");
  }
}
function hasEmptyFlags(flags) {
  if (flags !== 0) {
    throw new DecoderError("Invalid fixed header flags");
  }
}
class DecoderError extends Error {
  constructor(message) {
    super(message);
    this.name = "DecoderError";
  }
}
class Decoder {
  buf;
  pos;
  len;
  constructor(buf, pos = 0) {
    this.buf = buf;
    this.pos = pos;
    this.len = buf.length;
  }
  checkpos(pos) {
    if (pos > this.len) {
      throw new DecoderError("Packet too short");
    }
  }
  getByte() {
    this.checkpos(this.pos);
    return this.buf[this.pos++];
  }
  getInt16() {
    const msb = this.getByte();
    const lsb = this.getByte();
    return msb << 8 | lsb;
  }
  getByteArray() {
    const len = this.getInt16();
    const start = this.pos;
    const end = this.pos + len;
    this.pos = end;
    this.checkpos(end);
    return this.buf.subarray(start, end);
  }
  getUtf8String() {
    const str = utf8Decoder.decode(this.getByteArray());
    return str;
  }
  getTopic() {
    const topic = this.getUtf8String();
    if (invalidTopic(topic)) {
      throw new DecoderError(
        "Topic must contain valid UTF-8 and contain more than 1 byte and no wildcards",
      );
    }
    return topic;
  }
  getTopicFilter() {
    const topicFilter = this.getUtf8String();
    if (invalidTopicFilter(topicFilter)) {
      throw new DecoderError(
        "Topicfilter must contain valid UTF-8 and contain more than 1 byte and valid wildcards",
      );
    }
    return topicFilter;
  }
  getRemainder() {
    const start = this.pos;
    const end = this.len;
    this.pos = end;
    return this.buf.subarray(start, end);
  }
  atEnd() {
    if (this.len === this.pos) {
      return true;
    }
    return false;
  }
  done() {
    if (this.atEnd()) {
      return true;
    }
    throw new DecoderError("Packet too long");
  }
}

function invalidProtocolName(version, name) {
  if (version === 4 && name !== "MQTT") {
    return true;
  }
  return false;
}
var connect = {
  encode(packet) {
    const flags = 0;
    const protocolLevel = 4;
    const protocolName = "MQTT";
    const clientId = packet.clientId || "";
    const usernameFlag = !!packet.username;
    const passwordFlag = !!packet.password;
    const willRetain = !!packet.will?.retain;
    const willQoS = packet.will?.qos || 0;
    const willFlag = !!packet.will;
    const cleanSession = packet.clean !== false;
    const connectFlags = (usernameFlag ? BitMask.bit7 : 0) +
      (passwordFlag ? BitMask.bit6 : 0) + (willRetain ? BitMask.bit5 : 0) +
      (willQoS & 2 ? BitMask.bit4 : 0) + (willQoS & 1 ? BitMask.bit3 : 0) +
      (willFlag ? BitMask.bit2 : 0) + (cleanSession ? BitMask.bit1 : 0);
    const keepAlive = packet.keepAlive || 0;
    const encoder = new Encoder();
    encoder.setUtf8String(protocolName).setByte(protocolLevel).setByte(
      connectFlags,
    ).setInt16(keepAlive).setUtf8String(clientId);
    if (packet.will) {
      encoder.setTopic(packet.will.topic).setByteArray(packet.will.payload);
    }
    if (packet.username) {
      encoder.setUtf8String(packet.username);
    }
    if (packet.password) {
      encoder.setByteArray(packet.password);
    }
    return { flags, bytes: encoder.done() };
  },
  decode(buffer, flags) {
    const decoder = new Decoder(buffer);
    const protocolName = decoder.getUtf8String();
    const protocolLevel = decoder.getByte();
    if (invalidProtocolName(protocolLevel, protocolName)) {
      throw new DecoderError("Invalid protocol name");
    }
    const connectFlags = decoder.getByte();
    const usernameFlag = booleanFlag(connectFlags, BitMask.bit7);
    const passwordFlag = booleanFlag(connectFlags, BitMask.bit6);
    const willRetain = booleanFlag(connectFlags, BitMask.bit5);
    const willQoS = (connectFlags & BitMask.bit4 + BitMask.bit3) >> 3;
    const willFlag = booleanFlag(connectFlags, BitMask.bit2);
    const cleanSession = booleanFlag(connectFlags, BitMask.bit1);
    const reservedBit = booleanFlag(connectFlags, BitMask.bit0);
    hasEmptyFlags(flags);
    if (reservedBit) {
      throw new DecoderError("Invalid reserved bit");
    }
    if (willQoS !== 0 && willQoS !== 1 && willQoS !== 2) {
      throw new DecoderError("Invalid will qos");
    }
    const keepAlive = decoder.getInt16();
    const clientId = decoder.getUtf8String();
    let willTopic;
    let willPayload;
    if (willFlag) {
      willTopic = decoder.getTopic();
      willPayload = decoder.getByteArray();
    }
    let username;
    let password;
    if (usernameFlag) {
      username = decoder.getUtf8String();
    }
    if (passwordFlag) {
      password = decoder.getByteArray();
    }
    decoder.done();
    if (!willFlag && (willQoS !== 0 || willRetain === true)) {
      throw new DecoderError(
        "Will QoS must be 0 and Will retain to false when Will flag is false",
      );
    }
    if (clientId.length === 0 && cleanSession === false) {
      throw new DecoderError("Clean session must be true if clientID is empty");
    }
    return {
      type: PacketType.connect,
      protocolName,
      protocolLevel,
      clientId,
      username: username ? username : void 0,
      password: password ? password : void 0,
      will: willFlag
        ? {
          topic: willTopic || "",
          payload: willPayload || Uint8Array.from([0]),
          retain: willRetain,
          qos: willQoS,
        }
        : void 0,
      clean: cleanSession,
      keepAlive,
    };
  },
};

const AuthenticationResult = {
  ok: 0,
  unacceptableProtocol: 1,
  rejectedUsername: 2,
  serverUnavailable: 3,
  badUsernameOrPassword: 4,
  notAuthorized: 5,
};
const AuthenticationResultByNumber = Object.fromEntries(
  Object.entries(AuthenticationResult).map(([k, v]) => [v, k]),
);

var connack = {
  encode(packet) {
    const flags = 0;
    return {
      flags,
      bytes: [packet.sessionPresent ? 1 : 0, packet.returnCode || 0],
    };
  },
  decode(buffer, _flags) {
    const decoder = new Decoder(buffer);
    const sessionPresent = booleanFlag(decoder.getByte(), BitMask.bit0);
    const returnCode = decoder.getByte();
    decoder.done();
    if (!AuthenticationResultByNumber[returnCode]) {
      throw new DecoderError("Invalid return code");
    }
    return {
      type: PacketType.connack,
      sessionPresent,
      returnCode,
    };
  },
};

var publish = {
  encode(packet) {
    const qos = packet.qos || 0;
    const flags = (packet.dup ? BitMask.bit3 : 0) +
      (qos & 2 ? BitMask.bit2 : 0) + (qos & 1 ? BitMask.bit1 : 0) +
      (packet.retain ? BitMask.bit0 : 0);
    const encoder = new Encoder();
    encoder.setTopic(packet.topic);
    if (qos === 1 || qos === 2) {
      if (typeof packet.id !== "number" || packet.id < 1) {
        throw new EncoderError("when qos is 1 or 2, packet must have id");
      }
      encoder.setInt16(packet.id);
    }
    encoder.setRemainder(packet.payload);
    return { flags, bytes: encoder.done() };
  },
  decode(buffer, flags) {
    const dup = booleanFlag(flags, BitMask.bit3);
    const qos = (flags & 6) >> 1;
    const retain = booleanFlag(flags, BitMask.bit0);
    if (qos !== 0 && qos !== 1 && qos !== 2) {
      throw new DecoderError("Invalid qos");
    }
    if (dup && qos === 0) {
      throw new DecoderError("Invalid qos for possible duplicate");
    }
    const decoder = new Decoder(buffer);
    const topic = decoder.getTopic();
    let id = 0;
    if (qos > 0) {
      id = decoder.getInt16();
    }
    const payload = decoder.getRemainder();
    return {
      type: PacketType.publish,
      topic,
      payload,
      dup,
      retain,
      qos,
      id,
    };
  },
};

var puback = {
  encode(packet) {
    const flags = 0;
    const encoder = new Encoder();
    encoder.setInt16(packet.id);
    return { flags, bytes: encoder.done() };
  },
  decode(buffer) {
    const decoder = new Decoder(buffer);
    const id = decoder.getInt16();
    decoder.done();
    return {
      type: PacketType.puback,
      id,
    };
  },
};

var pubrec = {
  encode(packet) {
    const flags = 0;
    const encoder = new Encoder();
    encoder.setInt16(packet.id);
    return { flags, bytes: encoder.done() };
  },
  decode(buffer) {
    const decoder = new Decoder(buffer);
    const id = decoder.getInt16();
    decoder.done();
    return {
      type: PacketType.pubrec,
      id,
    };
  },
};

var pubrel = {
  encode(packet) {
    const flags = 0;
    const encoder = new Encoder();
    encoder.setInt16(packet.id);
    return { flags, bytes: encoder.done() };
  },
  decode(buffer) {
    const decoder = new Decoder(buffer);
    const id = decoder.getInt16();
    decoder.done();
    return {
      type: PacketType.pubrel,
      id,
    };
  },
};

var pubcomp = {
  encode(packet) {
    const flags = 0;
    const encoder = new Encoder();
    encoder.setInt16(packet.id);
    return { flags, bytes: encoder.done() };
  },
  decode(buffer) {
    const decoder = new Decoder(buffer);
    const id = decoder.getInt16();
    decoder.done();
    return {
      type: PacketType.pubcomp,
      id,
    };
  },
};

var subscribe = {
  encode(packet) {
    const flags = 2;
    const encoder = new Encoder();
    encoder.setInt16(packet.id);
    for (const sub of packet.subscriptions) {
      encoder.setTopic(sub.topicFilter);
      encoder.setByte(sub.qos);
    }
    return { flags, bytes: encoder.done() };
  },
  decode(buffer, flags) {
    if (!booleanFlag(flags, BitMask.bit1)) {
      throw new DecoderError("Invalid header");
    }
    const decoder = new Decoder(buffer);
    const id = decoder.getInt16();
    const subscriptions = [];
    do {
      const topicFilter = decoder.getTopicFilter();
      const qos = decoder.getByte();
      if (qos !== 0 && qos !== 1 && qos !== 2) {
        throw new DecoderError("Invalid qos");
      }
      if (qos > 0 && id === 0) {
        throw new DecoderError("Invalid packet identifier");
      }
      subscriptions.push({
        topicFilter,
        qos,
      });
    } while (!decoder.atEnd());
    decoder.done();
    return {
      type: PacketType.subscribe,
      id,
      subscriptions,
    };
  },
};

var suback = {
  encode(packet) {
    const flags = 0;
    const encoder = new Encoder();
    encoder.setInt16(packet.id);
    encoder.setRemainder(packet.returnCodes);
    return {
      flags,
      bytes: encoder.done(),
    };
  },
  decode(buffer) {
    const decoder = new Decoder(buffer);
    const id = decoder.getInt16();
    const payload = decoder.getRemainder();
    const returnCodes = [];
    for (const code of payload) {
      returnCodes.push(code);
    }
    return {
      type: PacketType.suback,
      id,
      returnCodes,
    };
  },
};

var unsubscribe = {
  encode(packet) {
    const flags = 2;
    const encoder = new Encoder();
    encoder.setInt16(packet.id);
    for (const topicFilter of packet.topicFilters) {
      encoder.setTopicFilter(topicFilter);
    }
    return { flags, bytes: encoder.done() };
  },
  decode(buffer, flags) {
    if (!booleanFlag(flags, BitMask.bit1)) {
      throw new DecoderError("Invalid header");
    }
    const decoder = new Decoder(buffer);
    const id = decoder.getInt16();
    const topicFilters = [];
    do {
      const topicFilter = decoder.getTopicFilter();
      topicFilters.push(topicFilter);
    } while (!decoder.atEnd());
    decoder.done();
    return {
      type: PacketType.unsubscribe,
      id,
      topicFilters,
    };
  },
};

var unsuback = {
  encode(packet) {
    const flags = 0;
    const encoder = new Encoder();
    encoder.setInt16(packet.id);
    return { flags, bytes: encoder.done() };
  },
  decode(buffer) {
    const decoder = new Decoder(buffer);
    const id = decoder.getInt16();
    decoder.done();
    return {
      type: PacketType.unsuback,
      id,
    };
  },
};

var pingreq = {
  encode(_packet) {
    const flags = 0;
    return { flags, bytes: [] };
  },
  decode(buffer, flags) {
    hasEmptyFlags(flags);
    isEmptyBuf(buffer);
    return {
      type: PacketType.pingreq,
    };
  },
};

var pingres = {
  encode(_packet) {
    const flags = 0;
    return { flags, bytes: [] };
  },
  decode(buffer) {
    isEmptyBuf(buffer);
    return {
      type: PacketType.pingres,
    };
  },
};

var disconnect = {
  encode(_packet) {
    const flags = 0;
    return { flags, bytes: [] };
  },
  decode(buffer, _flags) {
    isEmptyBuf(buffer);
    return {
      type: PacketType.disconnect,
    };
  },
};

const packetsByType = [
  null,
  connect,
  // 1
  connack,
  // 2
  publish,
  // 3
  puback,
  // 4
  pubrec,
  // 5
  pubrel,
  // 6
  pubcomp,
  // 7
  subscribe,
  // 8
  suback,
  // 9
  unsubscribe,
  // 10
  unsuback,
  // 11
  pingreq,
  // 12
  pingres,
  // 13
  disconnect,
  // 14
];
function encode(packet) {
  const packetType = packet.type;
  const pkt = packet;
  const encoded = packetsByType[packetType]?.encode(pkt);
  if (!encoded) {
    throw Error("Packet encoding failed");
  }
  const { flags, bytes } = encoded;
  return Uint8Array.from([
    packetType << 4 | flags,
    ...encodeLength(bytes.length),
    ...bytes,
  ]);
}
function decodePayload(firstByte, buffer) {
  const packetType = firstByte >> 4;
  const flags = firstByte & 15;
  const packet = packetsByType[packetType]?.decode(buffer, flags);
  if (packet !== void 0) {
    return packet;
  }
  throw new Error("packet decoding failed");
}

class AssertionError extends Error {
  /** Constructs a new instance. */
  constructor(message) {
    super(message);
    this.name = "AssertionError";
  }
}
function assert(expr, msg = "") {
  if (!expr) {
    throw new AssertionError(msg);
  }
}

const LogLevel = {
  error: 0,
  warn: 1,
  info: 2,
  verbose: 3,
  debug: 4,
};
class Logger {
  defaultError = console.error;
  defaultWarn = console.warn;
  defaultInfo = console.info;
  defaultVerbose = console.log;
  defaultDebug = console.log;
  // deno-lint-ignore no-explicit-any
  noop = (..._data) => {
  };
  error = this.defaultError;
  warn = this.defaultWarn;
  info = this.defaultInfo;
  verbose = this.noop;
  debug = this.noop;
  constructor() {
  }
  level(logLevel) {
    this.warn = logLevel > 0 ? this.defaultWarn : this.noop;
    this.info = logLevel > 1 ? this.defaultInfo : this.noop;
    this.verbose = logLevel > 2 ? this.defaultVerbose : this.noop;
    this.debug = logLevel > 3 ? this.defaultDebug : this.noop;
  }
}
const logger = new Logger();

class Conn {
  reader;
  writer;
  closed;
  remoteAddr;
  closer;
  constructor(sockConn) {
    this.closed = false;
    this.reader = sockConn.readable.getReader({ mode: "byob" });
    this.writer = sockConn.writable.getWriter();
    this.closer = sockConn.closer;
    this.remoteAddr = sockConn.remoteAddr;
  }
  async read(buff) {
    const buff2 = new Uint8Array(buff.length);
    const result = await this.reader.read(buff2);
    if (!result.done) {
      buff.set(result.value);
    }
    return result.value?.byteLength || null;
  }
  write(data) {
    if (this.closed) {
      return Promise.reject();
    }
    this.writer.write(data);
    return new Promise((resolve) => resolve(data.length));
  }
  close() {
    if (!this.closed) {
      this.closed = true;
      this.closer();
    }
  }
}

const MqttConnError = {
  invalidPacket: "Invalid Packet",
  packetTooLarge: "Packet too large",
  UnexpectedEof: "Unexpected EOF",
};
async function readByte(conn) {
  const buf = new Uint8Array(1);
  const bytesRead = await conn.read(buf);
  assert(bytesRead !== null, MqttConnError.UnexpectedEof);
  assert(bytesRead !== 0, MqttConnError.UnexpectedEof);
  return buf[0];
}
async function readFull(conn, buf) {
  let bytesRead = 0;
  while (bytesRead < buf.length) {
    const read = await conn.read(buf.subarray(bytesRead));
    assert(read !== null, MqttConnError.UnexpectedEof);
    assert(read !== 0, MqttConnError.UnexpectedEof);
    bytesRead += read;
  }
}
async function readPacket(conn, maxPacketSize) {
  const decodeLength = getLengthDecoder();
  const firstByte = await readByte(conn);
  let result;
  do {
    const byte = await readByte(conn);
    result = decodeLength(byte);
  } while (!result.done);
  const remainingLength = result.length;
  assert(remainingLength < maxPacketSize - 1, MqttConnError.packetTooLarge);
  const packetBuf = new Uint8Array(remainingLength);
  await readFull(conn, packetBuf);
  const packet = decodePayload(firstByte, packetBuf);
  assert(packet !== null, MqttConnError.UnexpectedEof);
  return packet;
}
class MqttConn {
  conn;
  maxPacketSize;
  _reason = void 0;
  _isClosed = false;
  constructor({
    conn,
    maxPacketSize,
  }) {
    this.conn = new Conn(conn);
    this.maxPacketSize = maxPacketSize || 2 * 1024 * 1024;
  }
  get reason() {
    return this._reason;
  }
  async *[Symbol.asyncIterator]() {
    while (!this._isClosed) {
      try {
        yield await readPacket(this.conn, this.maxPacketSize);
      } catch (err) {
        if (err instanceof Error) {
          if (err.name === "PartialReadError") {
            err.message = MqttConnError.UnexpectedEof;
          }
          this._reason = err.message;
        }
        this.close();
        break;
      }
    }
  }
  async send(data) {
    try {
      await this.conn.write(encode(data));
    } catch {
      this.close();
    }
  }
  get isClosed() {
    return this._isClosed;
  }
  close() {
    if (this.isClosed) return;
    try {
      this.conn.close();
    } catch (e) {
      console.error(e);
    } finally {
      this._isClosed = true;
    }
  }
}

class Timer {
  delay;
  // delay in microseconds
  // deno-lint-ignore ban-types
  action;
  // function to perform when timer expires
  timer = 0;
  end = 0;
  running = false;
  // deno-lint-ignore ban-types
  constructor(action, delay, wait = false) {
    this.delay = delay;
    this.action = action;
    if (!wait) {
      this.reset();
    }
  }
  startTimer(delay) {
    this.running = true;
    this.timer = setTimeout(() => this.ring(), delay);
  }
  ring() {
    const timeLeft = this.end - Date.now();
    if (timeLeft > 0) {
      this.startTimer(timeLeft);
      return;
    }
    this.running = false;
    this.action();
  }
  reset() {
    this.end = Date.now() + this.delay;
    if (!this.running) {
      this.startTimer(this.delay);
    }
  }
  clear() {
    clearTimeout(this.timer);
    this.running = false;
  }
}

export {
  assert as a,
  AuthenticationResult as A,
  AuthenticationResultByNumber as b,
  logger as l,
  LogLevel as L,
  MqttConn as M,
  PacketNameByType as c,
  PacketType as P,
  Timer as T,
};
