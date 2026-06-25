import type { MqttConn } from "@seriousme/opifex/mqttConn";
import { withTimeout } from "./timers.ts";
import { MQTTLevel, PacketType } from "@seriousme/opifex/mqttPacket";
import type {
  AnyPacket,
  ConnackPacket,
  ConnectPacket,
  QoS,
  TopicFilter,
} from "@seriousme/opifex/mqttPacket";
import assert from "node:assert/strict";

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
  mqttConn.send(connectPacket);
  const { value: connack } = await mqttConn.next();
  assert.deepStrictEqual(connack.type, PacketType.connack, "Expected CONNACK");
  return connack;
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

export async function ping(mqttConn: MqttConn) {
  mqttConn.send(pingreqPacket);
  const { value: pingres } = await mqttConn.next();
  assert.deepStrictEqual(pingres.type, PacketType.pingres);
}
