import type { MqttConn } from "@seriousme/opifex/mqttConn";
import { withTimeout } from "./timers.ts";
import { MQTTLevel, PacketType } from "@seriousme/opifex/mqttPacket";
import type { AnyPacket, QoS, TopicFilter } from "@seriousme/opifex/mqttPacket";
import assert from "node:assert/strict";

const txtEncoder = new TextEncoder();
let clientIdCounter = 1;

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
  clientId?: number;
}): Promise<void> {
  const connectPacket: AnyPacket = {
    type: PacketType.connect,
    protocolName: "MQTT",
    protocolLevel: 4,
    clientId: `testClient-${options?.clientId || clientIdCounter++}`,
    clean: true,
    keepAlive: 0,
    username: "IoTester_1",
    password: txtEncoder.encode("strong_password"),
    will: undefined,
  };
  mqttConn.send(connectPacket);
  const { value: connack } = await mqttConn.next();
  assert.deepStrictEqual(connack.type, PacketType.connack, "Expected CONNACK");
}

export async function subscribe(
  subscriber: MqttConn,
  topicFilter: TopicFilter,
  qos: QoS,
  id = 24,
) {
  subscriber.send({
    type: PacketType.subscribe,
    protocolLevel: MQTTLevel.v4,
    id,
    subscriptions: [{
      topicFilter,
      qos,
    }],
  });

  const { value: packet } = await subscriber.next();
  assert.equal(packet.type, PacketType.suback);
  assert.equal(packet.returnCodes[0], qos);
  assert.equal(packet.id, id);
  return packet;
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
