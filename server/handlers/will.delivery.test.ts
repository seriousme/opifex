import assert from "node:assert/strict";
import { test } from "node:test";
import { PacketType } from "../deps.ts";
import {
  connect,
  disconnect,
  ping,
  startMockServer2,
  subscribe,
} from "../../dev_utils/mod.ts";

const txtEncoder = new TextEncoder();

test("MQTT-3.1.2.5: will message delivered on ungraceful disconnect", {
  skip: false,
}, async () => {
  const willTopic = "will/topic";
  const payload = txtEncoder.encode("goodbye");
  const { mqttConn1: subscriber, mqttConn2: publisher } = startMockServer2();

  // Subscriber connects
  await connect(subscriber, { clientId: "subscriber1" });
  await subscribe(subscriber, [{ topicFilter: willTopic, qos: 0 }]);

  // Publisher connects
  await connect(publisher, {
    clientId: "publisher1",
    will: {
      topic: willTopic,
      payload,
      qos: 0,
      retain: false,
    },
  });

  // Force close the publisher connection without sending DISCONNECT
  // This simulates an ungraceful disconnect
  publisher.close();
  assert.deepStrictEqual(publisher.isClosed, true, "publisher is closed");

  // Subscriber should receive the will message
  const { value: willMessage } = await subscriber.next();

  assert.deepStrictEqual(
    willMessage.type,
    PacketType.publish,
    "Expecting a Publish packet",
  );
  assert.deepStrictEqual(
    willMessage.topic,
    willTopic,
    "Expecting correct topic",
  );
  assert.deepStrictEqual(
    willMessage.payload,
    payload,
    "Expecting correct payload",
  );

  // Clean up
  await disconnect(subscriber);
});

test("MQTT-3.1.2.5: will message NOT delivered on graceful DISCONNECT", {
  skip: false,
}, async () => {
  const willTopic = "will/topic2";
  const payload = txtEncoder.encode("goodbye");
  const { mqttConn1: subscriber, mqttConn2: publisher } = startMockServer2();

  // Subscriber connects
  await connect(subscriber, { clientId: "subscriber2" });
  await subscribe(subscriber, [{ topicFilter: willTopic, qos: 0 }]);

  // Publisher connects
  await connect(publisher, {
    clientId: "publisher2",
    will: {
      topic: willTopic,
      payload,
      qos: 0,
      retain: false,
    },
  });
  // Publisher gracefully disconnects
  await disconnect(publisher);

  // Send PINGREQ to verify no will message was queued before it
  await ping(subscriber);

  // Clean up
  await disconnect(subscriber);
});

test("MQTT-3.1.2.5: will message delivered with correct QoS", {
  skip: false,
}, async () => {
  const willTopic = "will/qos";
  const payload = txtEncoder.encode("goodbye");
  const { mqttConn1: subscriber, mqttConn2: publisher } = startMockServer2();

  // Subscriber connects
  await connect(subscriber, { clientId: "subscriber3" });
  await subscribe(subscriber, [{ topicFilter: willTopic, qos: 1 }]);

  // Publisher connects with will message QoS 1
  await connect(publisher, {
    clientId: "publisher3",
    will: {
      topic: willTopic,
      payload,
      qos: 1,
      retain: false,
    },
  });

  // Force close the publisher connection
  publisher.close();

  // Subscriber should receive the will message with QoS 1
  const { value: willMessage } = await subscriber.next();
  assert.deepStrictEqual(willMessage.type, PacketType.publish);

  assert.deepStrictEqual(
    willMessage.type,
    PacketType.publish,
    "Expecting a Publish packet",
  );
  assert.deepStrictEqual(
    willMessage.topic,
    willTopic,
    "Expecting correct topic",
  );
  assert.deepStrictEqual(
    willMessage.qos,
    1,
    "Expecting correct QoS",
  );

  // Clean up
  await disconnect(subscriber);
});

test("MQTT-3.1.2.5: will message stored as retained when retain=true", {
  skip: false,
}, async () => {
  const willTopic = "will/retained";
  const payload = txtEncoder.encode("Retained message");
  const { mqttConn1: subscriber, mqttConn2: publisher } = startMockServer2();

  // Subscriber connects
  await connect(subscriber, { clientId: "subscriber4" });

  // Publisher connects with will retain true
  await connect(publisher, {
    clientId: "publisher4",
    will: {
      topic: willTopic,
      payload,
      qos: 0,
      retain: true,
    },
  });

  // Force close the publisher connection
  publisher.close();

  // Now subscribe to the topic - should receive the retained message
  await subscribe(subscriber, [{ topicFilter: willTopic, qos: 0 }]);

  // Should receive the retained will message
  const { value: willMessage } = await subscriber.next();
  assert.deepStrictEqual(
    willMessage.type,
    PacketType.publish,
    "Expecting PUBLISH packet",
  );
  assert.deepStrictEqual(
    willMessage.topic,
    willTopic,
    "Expecting correct topic",
  );
  assert.deepStrictEqual(willMessage.retain, true, "Expecting retain true");
  assert.deepStrictEqual(
    willMessage.payload,
    payload,
    "Expecting correct payload",
  );

  // Clean up
  await disconnect(subscriber);
});

test("MQTT-3.1.2.5: will message to $ topic is rejected", {
  skip: false,
}, async () => {
  const willTopic = "$SYS/will";
  const payload = txtEncoder.encode("System Will");
  const { mqttConn1: subscriber, mqttConn2: publisher } = startMockServer2();

  // Subscriber connects
  await connect(subscriber, { clientId: "subscriber5" });
  await subscribe(subscriber, [{ topicFilter: willTopic, qos: 0 }]);

  // Publisher connects with will message to system topic
  await connect(publisher, {
    clientId: "publisher5",
    will: {
      topic: willTopic,
      payload,
      qos: 0,
      retain: false,
    },
  });

  // Force close the publisher connection
  publisher.close();

  // Send PINGREQ to verify no will message was queued
  await ping(subscriber);

  // Clean up
  await disconnect(subscriber);
});
