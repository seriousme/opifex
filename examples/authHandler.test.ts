import { test } from "node:test";
import assert from "node:assert/strict";
import { TcpClient } from "@seriousme/opifex/tcpClient";
import { TcpServer } from "@seriousme/opifex/tcpServer";
import { delay, logger, LogLevel } from "@seriousme/opifex/utils";
import type { PublishPacket, QoS } from "@seriousme/opifex/mqttPacket";
import { ReasonCode } from "@seriousme/opifex/server";
// just for demo purposes: ReasonCode is identical in server and client
import {
  MQTTLevel,
  ReasonCode as ClientReasonCode,
} from "@seriousme/opifex/client";

import type { Context } from "@seriousme/opifex/server";

const txtEncoder = new TextEncoder();
const txtDecoder = new TextDecoder();

logger.level(LogLevel.info);
const firstClientMessage = "first client message";
const secondClientMessage = "second client message";
const firstServerMessage = "first server message";
const secondServerMessage = "second server message";

const authMethodForTest = "opifex-for-test-only";

function serverProcessAuth(
  _ctx: Context,
  _clientId: string,
  authMethod: string,
  authData: Uint8Array,
) {
  logger.debug("serverProcessAuth", authMethod, txtDecoder.decode(authData));
  if (authMethod !== authMethodForTest) {
    return {
      reasonCode: ReasonCode.badAuthenticationMethod,
    };
  }
  const authDataString = txtDecoder.decode(authData);
  if (authDataString === firstClientMessage) {
    return {
      reasonCode: ReasonCode.continueAuthentication,
      authData: txtEncoder.encode(firstServerMessage),
    };
  }

  if (authDataString === secondClientMessage) {
    return {
      reasonCode: ReasonCode.success,
      authData: txtEncoder.encode(secondServerMessage),
    };
  }
  return {
    reasonCode: ReasonCode.notAuthorized,
  };
}

function clientProcessAuth(
  authMethod: string,
  authData: Uint8Array,
) {
  const authDataString = txtDecoder.decode(authData);
  logger.debug("clientProcessAuth", authMethod, authDataString);
  if (
    authMethod !== authMethodForTest ||
    (
      authDataString !== firstServerMessage &&
      authDataString !== secondServerMessage
    )
  ) {
    return {
      reasonCode: ClientReasonCode.badAuthenticationMethod,
      reasonString: "Unknown method or bad data",
    };
  }
  return {
    reasonCode: ClientReasonCode.continueAuthentication,
    authData: txtEncoder.encode(secondClientMessage),
    reasonString: "Continue",
  };
}

test("Test MQTTv5 Auth using TCP client and server", async function () {
  const server = new TcpServer({ port: 0 }, {
    handlers: {
      processAuth: serverProcessAuth,
    },
  });
  server.start();

  assert.deepStrictEqual(
    server.port !== undefined,
    true,
    "server runs a a random port",
  );
  logger.info(
    `TCP server running on port: ${server.port}, address: ${server.address}`,
  );

  const params = {
    url: new URL(`mqtt://${server.address}:${server.port}`),
    numberOfRetries: 0,
    options: {
      protocolLevel: MQTTLevel.v5,
      properties: {
        authenticationMethod: authMethodForTest,
        authenticationData: txtEncoder.encode(firstClientMessage),
      },
    },
  };

  const client = new TcpClient();
  client.onAuth = clientProcessAuth;
  await client.connect(params);
  logger.info(`Client connected to server at ${client.url}`);

  const publishSet: { topic: string; qos: QoS }[] = [
    { topic: "t0@q0", qos: 0 },
    { topic: "t1@q0", qos: 0 },
  ];

  const subscriptions = publishSet.map((item) => ({
    topicFilter: item.topic,
    qos: item.qos,
  }));
  await client.subscribe({
    subscriptions,
  });

  // the IIFE ensures message reception runs in parallel
  logger.info(`Start receiving`);
  const received: PublishPacket[] = [];
  (async function () {
    for await (const item of client.messages()) {
      logger.verbose(`Receiving: ${item.topic} -- ${item.qos}`);
      received.push(item);
    }
  })();
  // end of IIFE
  for (const item of publishSet) {
    logger.verbose(`Publishing: ${item.topic} -- ${item.qos}`);
    await client.publish({
      topic: item.topic,
      qos: item.qos,
      payload: new Uint8Array([0x01]),
    });
  }

  await delay(100);
  logger.info(`Disconnect client`);
  await client.disconnect();

  logger.info(`Check completeness`);
  for (const item of publishSet) {
    const found = received.find((f) =>
      f.topic == item.topic && f.qos === item.qos
    );
    logger.verbose(`Found: ${item.topic} -- ${item.qos}`);
    assert(found, `${item.topic} -- ${item.qos}`);
  }

  logger.info(`Stop server`);
  server.stop();
});
