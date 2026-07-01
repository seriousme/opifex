// Standalone aedes broker used by the MQTT compatibility workflow.
//
// It boots the broker from *this branch* on a plain-TCP port so the Eclipse Paho
// interoperability suite (tools/mqtt-compat/run_compat.py) can drive it as an
// external broker. v5 capabilities the suite exercises are enabled here so the
// reported score reflects real broker ability, not a broker started with features
// switched off (e.g. inbound topic aliases are a no-op when topicAliasMaximum: 0).
//
// Usage: MQTT_PORT=1883 node tools/mqtt-compat/broker.js
import { TcpServer } from "../../node/tcpServer.ts";
import type { Context, Topic } from "../../server/mod.ts";
import { logger, LogLevel } from "../../utils/mod.ts";

logger.level(LogLevel.info);

const port = Number(process.env.MQTT_PORT) || 1883;

// The Paho `test_subscribe_failure` (v3.1.1 and v5) subscribes to a topic that is
// "not allowed to be subscribed to" and asserts the broker answers with SUBACK
// reason code 0x80.

const NO_SUBSCRIBE_TOPIC = "test/nosubscribe";

function isAuthorizedToSubscribe(ctx: Context, topic: Topic): boolean {
  logger.debug(
    `Checking authorization of client '${ctx.store?.clientId}' to subscribe to topic '${topic}'`,
  );
  return topic !== NO_SUBSCRIBE_TOPIC;
}

const tcpServer = new TcpServer({ port }, {
  handlers: {
    isAuthorizedToSubscribe,
  },
});
tcpServer.start();
logger.info(`Server started on port ${tcpServer.port}`);

function shutdown() {
  tcpServer.stop();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
