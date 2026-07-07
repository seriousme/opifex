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

export async function connect(mqttConn: MqttConn, options?: {
  clientId?: string;
  keepAlive?: number;
  clean?: boolean;
  will?: ConnectPacket["will"];
}): Promise<ConnackPacket> {
  const connectPacket: AnyPacket = {
    type: PacketType.connect,
    protocolName: "MQTT",
    protocolLevel: 4,
    clientId: options?.clientId || `testClient-${clientIdCounter++}`,
    clean: options?.clean ?? true,
    keepAlive: options?.keepAlive || 0,
    username: "IoTester_1",
    password: txtEncoder.encode("strong_password"),
    will: options?.will,
  };
  logger.debug("connectHelper: sending connect");
  mqttConn.send(connectPacket);
  const { value: connack } = await mqttConn.next();
  logger.debug("connectHelper: connack", connack);
  assert.deepStrictEqual(connack.type, PacketType.connack, "Expected CONNACK");
  return connack;
}

export async function subscribe(
  subscriber: MqttConn,
  subscriptions: {
    topicFilter: TopicFilter;
    qos: QoS;
  }[],
  id = 24,
) {
  subscriber.send({
    type: PacketType.subscribe,
    protocolLevel: MQTTLevel.v4,
    id,
    subscriptions,
  });

  const { value: packet } = await subscriber.next();
  assert.equal(packet.type, PacketType.suback);
  assert.equal(packet.id, id);
  for (let i = 0; i < packet.returnCodes.length; i++) {
    assert.equal(packet.returnCodes[i], subscriptions[i].qos);
  }
  return packet;
}

export async function publish(
  publisher: MqttConn,
  topic: Topic,
  qos: QoS,
  {
    id = 22,
    payload = "payload",
    retain = false,
  },
  checkAcks = true,
) {
  const encodedPayload = payload !== ""
    ? txtEncoder.encode(payload)
    : new Uint8Array([]);
  publisher.send({
    type: PacketType.publish,
    protocolLevel: MQTTLevel.v4,
    id,
    topic: topic,
    qos,
    payload: encodedPayload,
    retain: retain,
  });

  if (!checkAcks) {
    return;
  }
  if (qos === 0) return;

  const { value: ackPacket } = await publisher.next();
  const expectedAckType = qos === 1 ? PacketType.puback : PacketType.pubrec;
  assert.equal(ackPacket.type, expectedAckType, "received expected ack");
  assert.equal(ackPacket.id, id, "packetid matches");
  if (qos === 1) {
    return;
  }
  publisher.send({
    type: PacketType.pubrel,
    protocolLevel: MQTTLevel.v4,
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

export async function disconnect(mqttConn: MqttConn) {
  mqttConn.send({
    type: PacketType.disconnect,
    protocolLevel: MQTTLevel.v4,
  });
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
