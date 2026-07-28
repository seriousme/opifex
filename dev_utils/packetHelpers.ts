import type { MqttConn } from "../mqttConn/mqttConn.ts";
import { withTimeout } from "./timers.ts";
import { delay } from "./timers.ts";
import { MQTTLevel, PacketType } from "../mqttPacket/mod.ts";
import type {
  AnyPacket,
  ConnackPacket,
  ConnectPacket,
  DisconnectProperties,
  PublishProperties,
  QoS,
  Topic,
  TopicFilter,
} from "../mqttPacket/mod.ts";
import type {
  ConnackPacketV4,
  ConnackPacketV5,
} from "../mqttPacket/connack.ts";
import type { ConnectPacketV5 } from "../mqttPacket/connect.ts";
import assert from "node:assert/strict";
import { logger } from "../utils/mod.ts";

const txtEncoder = new TextEncoder();

let clientIdCounter = 1;

const PINGREQ_PACKET: AnyPacket = Object.freeze({
  type: PacketType.pingreq,
  protocolLevel: MQTTLevel.v4,
});

export function nextPacketWithTimeOut(
  conn: MqttConn,
  timeoutMs: number,
): Promise<IteratorResult<AnyPacket> | null> {
  return withTimeout(conn.next(), timeoutMs);
}

export async function checkNoPacket(mqttConn: MqttConn, timeoutMs = 10) {
  const result = await nextPacketWithTimeOut(mqttConn, timeoutMs);
  assert.equal(result, null, "no packet received");
}

async function baseConnect(mqttConn: MqttConn, {
  level = MQTTLevel.v4,
  clientId = `testClient-${clientIdCounter++}`,
  username = "IoTester_1",
  password = "strong_password",
  keepAlive = 0,
  clean = true,
  will = undefined as ConnectPacket["will"],
  properties = {},
  checkAck = true,
} = {}): Promise<ConnackPacket> {
  mqttConn.codecOpts.protocolLevel = level;
  const connectPacket: ConnectPacket = {
    type: PacketType.connect,
    protocolName: "MQTT",
    protocolLevel: level,
    clientId,
    clean,
    keepAlive,
    username,
    password: password !== "" ? txtEncoder.encode(password) : undefined,
    will,
  };
  if (connectPacket.protocolLevel === 5) {
    connectPacket.properties = properties;
  }
  logger.verbose("connectHelper: sending connect");
  logger.debug({ connectPacket });

  mqttConn.send(connectPacket);
  const { value: connack } = await mqttConn.next();
  logger.verbose("connectHelper: connack", connack);
  if (checkAck) {
    assert.deepStrictEqual(
      connack.type,
      PacketType.connack,
      "Expected CONNACK",
    );
  }
  mqttConn.codecOpts.protocolLevel = level;
  return connack;
}
export async function connect(mqttConn: MqttConn, {
  level = MQTTLevel.v4,
  clientId = `testClient-${clientIdCounter++}`,
  username = "IoTester_1",
  password = "strong_password",
  keepAlive = 0,
  clean = true,
  will = undefined as ConnectPacket["will"],
  checkAck = true,
} = {}): Promise<ConnackPacketV4> {
  return await baseConnect(mqttConn, {
    level,
    clientId,
    username,
    password,
    keepAlive,
    clean,
    will,
    checkAck,
  }) as ConnackPacketV4;
}

export async function connect5(mqttConn: MqttConn, {
  clientId = `testClient-${clientIdCounter++}`,
  username = "IoTester_1",
  password = "strong_password",
  keepAlive = 0,
  clean = true,
  will = undefined as ConnectPacket["will"],
  properties = {} as ConnectPacketV5["properties"],
  checkAck = true,
} = {}): Promise<ConnackPacketV5> {
  return await baseConnect(mqttConn, {
    level: MQTTLevel.v5,
    clientId,
    username,
    password,
    keepAlive,
    clean,
    will,
    properties,
    checkAck,
  }) as ConnackPacketV5;
}

export async function subscribe(
  subscriber: MqttConn,
  subscriptions: {
    topicFilter: TopicFilter;
    qos: QoS;
  }[],
  {
    id = 24,
    checkAcks = true,
  } = {},
) {
  const subscribePacket = {
    type: PacketType.subscribe,
    protocolLevel: MQTTLevel.v4,
    id,
    subscriptions,
  };

  subscriber.send(subscribePacket);

  const { value: packet } = await subscriber.next();
  assert.equal(packet.type, PacketType.suback, "Expected SUBACK");
  assert.equal(packet.id, id, "SUBACK ID should match SUBSCRIBE ID");

  if (checkAcks) {
    const results = packet.returnCodes || packet.reasonCodes;
    assert.equal(results.length, subscriptions.length, "ACK count match");
    for (let i = 0; i < results.length; i++) {
      assert.equal(results[i], subscriptions[i].qos);
    }
  }
  return packet;
}

export async function subscribe5(
  subscriber: MqttConn,
  subscriptions: {
    topicFilter: TopicFilter;
    qos: QoS;
    noLocal?: boolean;
    retainAsPublished?: boolean;
    retainHandling?: number;
  }[],
  {
    id = 24,
    subscriptionIdentifier = undefined as number | undefined,
    checkAcks = true,
  } = {},
) {
  const properties = subscriptionIdentifier !== undefined
    ? { subscriptionIdentifier }
    : {};

  const subscribePacket = {
    type: PacketType.subscribe,
    protocolLevel: MQTTLevel.v5,
    id,
    subscriptions,
    properties,
  };

  subscriber.send(subscribePacket);

  const { value: packet } = await subscriber.next();
  assert.equal(packet.type, PacketType.suback, "Expected SUBACK");
  assert.equal(packet.id, id, "SUBACK ID should match SUBSCRIBE ID");

  if (checkAcks) {
    const results = packet.returnCodes || packet.reasonCodes;
    assert.equal(results.length, subscriptions.length, "ACK count match");
    for (let i = 0; i < results.length; i++) {
      assert.equal(results[i], subscriptions[i].qos);
    }
  }
  return packet;
}

export async function unsubscribe(
  subscriber: MqttConn,
  topicFilters: TopicFilter[],
  {
    level = MQTTLevel.v4,
    id = 24,
  } = {},
) {
  subscriber.send({
    type: PacketType.unsubscribe,
    protocolLevel: level,
    id,
    topicFilters,
  });
  const { value: packet } = await subscriber.next();
  assert.equal(packet.type, PacketType.unsuback, "Expected UNSUBACK");
  assert.equal(packet.protocolLevel, level, "received expected level");
  assert.equal(packet.id, id, "UNSUBACK ID should match UNSUBSCRIBE ID");
}

export function unsubscribe5(
  subscriber: MqttConn,
  topicFilters: TopicFilter[],
  opts?: { id?: number },
) {
  return unsubscribe(
    subscriber,
    topicFilters,
    Object.assign({}, opts, { level: MQTTLevel.v5 }),
  );
}

export async function publish(
  publisher: MqttConn,
  topic: Topic,
  qos: QoS,
  {
    level = MQTTLevel.v4,
    id = 22,
    payload = "payload",
    retain = false,
    properties = {},
    checkAcks = true,
  } = {},
) {
  const encodedPayload = txtEncoder.encode(payload);

  await publisher.send({
    type: PacketType.publish,
    protocolLevel: level,
    id,
    topic,
    qos,
    payload: encodedPayload,
    retain,
    properties,
  });

  if (!checkAcks || qos === 0) return;

  const { value: ackPacket } = await publisher.next();
  const expectedAckType = qos === 1 ? PacketType.puback : PacketType.pubrec;
  assert.equal(ackPacket.type, expectedAckType, "received expected ack");
  assert.equal(ackPacket.protocolLevel, level, "received expected level");
  assert.equal(ackPacket.id, id, "packetid matches");

  if (qos === 1) return ackPacket;

  publisher.send({
    type: PacketType.pubrel,
    protocolLevel: level,
    id,
  });

  const { value: compPacket } = await publisher.next();
  assert.equal(
    compPacket.type,
    PacketType.pubcomp,
    "received expected pubcomp",
  );
  assert.equal(compPacket.id, id, "packetid of pubcomp matches");
}

export function publish5(
  publisher: MqttConn,
  topic: Topic,
  qos: QoS,
  opts?: {
    id?: number;
    payload?: string;
    retain?: boolean;
    properties?: PublishProperties;
    checkAcks?: boolean;
  },
) {
  return publish(
    publisher,
    topic,
    qos,
    Object.assign({}, opts, { level: MQTTLevel.v5 }),
  );
}

export async function disconnect(
  mqttConn: MqttConn,
  { level = MQTTLevel.v4 } = {},
) {
  mqttConn.send({
    type: PacketType.disconnect,
    protocolLevel: level,
  });
  await mqttConn.next();

  assert.strictEqual(
    mqttConn.isClosed,
    true,
    "Expected connection to be closed",
  );
}

export async function disconnect5(mqttConn: MqttConn, opts?: {
  reasonCode?: number;
  properties?: DisconnectProperties;
}) {
  const packet = {
    type: PacketType.disconnect,
    protocolLevel: MQTTLevel.v5,
    reasonCode: opts?.reasonCode,
    properties: opts?.properties,
  };

  mqttConn.send(packet);
  await mqttConn.next();

  assert.strictEqual(
    mqttConn.isClosed,
    true,
    "Expected connection to be closed",
  );
}

export async function ping(mqttConn: MqttConn) {
  mqttConn.send(PINGREQ_PACKET);
  const { value: pingres } = await mqttConn.next();
  assert.strictEqual(pingres.type, PacketType.pingres);
}

export async function receiveMessages(conn: MqttConn) {
  const received = Array.fromAsync(conn);
  await delay(10);
  await disconnect(conn);
  const messages = await received;
  return messages;
}

export async function receiveMessages5(conn: MqttConn) {
  const received = Array.fromAsync(conn);
  await delay(10);
  await disconnect5(conn);
  const messages = await received;
  return messages;
}
