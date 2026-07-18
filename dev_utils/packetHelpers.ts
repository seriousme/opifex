import type { MqttConn } from "../mqttConn/mqttConn.ts";
import { withTimeout } from "./timers.ts";
import { MQTTLevel, PacketType } from "../mqttPacket/mod.ts";
import type {
  AnyPacket,
  ConnackPacket,
  ConnectPacket,
  QoS,
  Topic,
  TopicFilter,
} from "@seriousme/opifex/mqttPacket";
import assert from "node:assert/strict";
import { logger } from "../utils/mod.ts";
import type {
  DisconnectProperties,
  PublishProperties,
} from "../mqttPacket/Properties.ts";

const txtEncoder = new TextEncoder();
let clientIdCounter = 1;

const pingreqPacket: AnyPacket = {
  type: PacketType.pingreq,
  protocolLevel: MQTTLevel.v4,
};

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

export async function connect(mqttConn: MqttConn, {
  level = MQTTLevel.v4,
  clientId = `testClient-${clientIdCounter++}`,
  keepAlive = 0,
  clean = true,
  will = undefined as ConnectPacket["will"],
} = {}): Promise<ConnackPacket> {
  const connectPacket: AnyPacket = {
    type: PacketType.connect,
    protocolName: "MQTT",
    protocolLevel: level,
    clientId,
    clean,
    keepAlive,
    username: "IoTester_1",
    password: txtEncoder.encode("strong_password"),
    will,
  };
  logger.verbose("connectHelper: sending connect");
  logger.debug({ connectPacket });
  mqttConn.send(connectPacket);
  const { value: connack } = await mqttConn.next();
  logger.verbose("connectHelper: connack", connack);
  assert.deepStrictEqual(connack.type, PacketType.connack, "Expected CONNACK");
  mqttConn.codecOpts.protocolLevel = level;
  return connack;
}

export async function connect5(mqttConn: MqttConn, opts: {
  clientId?: string;
  keepAlive?: number;
  clean?: boolean;
  will?: ConnectPacket["will"];
}): Promise<ConnackPacket> {
  return await connect(mqttConn, { ...opts, level: MQTTLevel.v5 });
}

export async function subscribe(
  subscriber: MqttConn,
  subscriptions: {
    topicFilter: TopicFilter;
    qos: QoS;
  }[],
  {
    level = MQTTLevel.v4,
    id = 24,
    checkAcks = true,
  } = {},
) {
  subscriber.send({
    type: PacketType.subscribe,
    protocolLevel: level,
    id,
    subscriptions,
  });

  const { value: packet } = await subscriber.next();
  assert.equal(packet.type, PacketType.suback, "Expected SUBACK");
  assert.equal(packet.protocolLevel, level, "received expected level");
  assert.equal(packet.id, id, "SUBACK ID should match SUBSCRIBE ID");
  if (checkAcks) {
    for (let i = 0; i < packet.returnCodes.length; i++) {
      assert.equal(packet.returnCodes[i], subscriptions[i].qos);
    }
  }
  return packet;
}

export async function subscribe5(
  subscriber: MqttConn,
  subscriptions: {
    topicFilter: TopicFilter;
    qos: QoS;
  }[],
  opts?: {
    id?: number;
    checkAcks?: boolean;
  },
) {
  return await subscribe(subscriber, subscriptions, { ...opts, level: MQTTLevel.v5 });
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

export async function unsubscribe5(
  subscriber: MqttConn,
  topicFilters: TopicFilter[],
  opts?: {
    id?: number;
  },
) {
  return await unsubscribe(subscriber, topicFilters, { ...opts, level: MQTTLevel.v5 });
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
  const encodedPayload = payload !== ""
    ? txtEncoder.encode(payload)
    : new Uint8Array([]);
  const publishPacket = {
    type: PacketType.publish,
    protocolLevel: level,
    id,
    topic,
    qos,
    payload: encodedPayload,
    retain,
    properties,
  };
  await publisher.send(publishPacket);

  if (!checkAcks) {
    return;
  }
  if (qos === 0) return;

  const { value: ackPacket } = await publisher.next();
  const expectedAckType = qos === 1 ? PacketType.puback : PacketType.pubrec;
  assert.equal(ackPacket.protocolLevel, level, "received expected level");
  assert.equal(ackPacket.type, expectedAckType, "received expected ack");
  assert.equal(ackPacket.id, id, "packetid matches");
  if (qos === 1) {
    return;
  }
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

export async function publish5(
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
  await publish(publisher, topic, qos, { ...opts, level: MQTTLevel.v5 });
}

export async function disconnect(mqttConn: MqttConn, {
  level = MQTTLevel.v4,
} = {}) {
  mqttConn.send({
    type: PacketType.disconnect,
    protocolLevel: level,
  });
  await mqttConn.next();

  assert.deepStrictEqual(
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

  assert.deepStrictEqual(
    mqttConn.isClosed,
    true,
    "Expected connection to be closed",
  );
}

export async function ping(mqttConn: MqttConn) {
  mqttConn.send(pingreqPacket);
  const { value: pingres } = await mqttConn.next();
  assert.deepStrictEqual(pingres.type, PacketType.pingres);
}
