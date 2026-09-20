import assert from "node:assert/strict";
import { test } from "node:test";
import type { Context } from "../context.ts";
import { PacketType, ReasonCode } from "../deps.ts";
import {
  auth,
  connect5,
  publish5,
  startMockServer,
  subscribe5,
  unsubscribe5,
} from "../../dev_utils/mod.ts";

const successHandler = () => {
  return {
    reasonCode: ReasonCode.success,
    authData: new Uint8Array([9, 9]),
    reasonString: "Re-auth successful",
  };
};

const multiStepHandler = (
  _ctx: Context,
  _clientId: string,
  _authMethod: string,
  authData: Uint8Array,
) => {
  if (authData[0] === 2) {
    return {
      reasonCode: ReasonCode.success,
    };
  }
  return {
    reasonCode: ReasonCode.continueAuthentication,
    authData: new Uint8Array([12]),
  };
};

test("Auth packet with no handler, closes connection", async () => {
  const { mqttConn } = startMockServer();

  // Connect first
  await connect5(mqttConn);

  // Send AUTH packet
  await auth(mqttConn);
  await mqttConn.next();

  assert.strictEqual(mqttConn.isClosed, true);
});

test("Auth packet without authenticationMethod or authenticationData closes connection", async () => {
  const { mqttConn } = startMockServer({
    handlers: { processAuth: successHandler },
  });

  await connect5(mqttConn);
  // Missing authenticationMethod and authenticationData
  await auth(mqttConn, { noMethod: true, noData: true });
  await mqttConn.next();
  assert.strictEqual(mqttConn.isClosed, true);
});

test("Auth packet triggers continueAuthentication response", async () => {
  const { mqttConn } = startMockServer({
    handlers: {
      processAuth(_ctx, _clientId, authMethod, authData) {
        assert.strictEqual(authMethod, "SCRAM-SHA-256");
        assert.deepStrictEqual(authData, new Uint8Array([1, 2, 3]));
        return {
          reasonCode: ReasonCode.continueAuthentication,
          authData: new Uint8Array([4, 5, 6]),
          reasonString: "Continue auth",
        };
      },
    },
  });

  await connect5(mqttConn);
  const response = await auth(mqttConn, {
    authMethod: "SCRAM-SHA-256",
    authData: new Uint8Array([1, 2, 3]),
  });

  assert.strictEqual(response?.type, PacketType.auth);
  assert.strictEqual(response?.reasonCode, ReasonCode.continueAuthentication);
  assert.strictEqual(
    response?.properties?.authenticationMethod,
    "SCRAM-SHA-256",
  );
  assert.deepStrictEqual(
    response?.properties?.authenticationData,
    new Uint8Array([4, 5, 6]),
  );
  assert.strictEqual(mqttConn.isClosed, false);
});

test("Connect packet completes initial connection with auth data", async () => {
  const { mqttConn } = startMockServer({
    handlers: { processAuth: successHandler },
  });

  await connect5(mqttConn, {
    clientId: "test",
    properties: {
      authenticationMethod: "SCRAM-SHA-256",
      authenticationData: new Uint8Array([1]),
    },
  });
});

test("Auth packet completes initial connection when in connecting state", async () => {
  const { mqttConn } = startMockServer({
    handlers: { processAuth: multiStepHandler },
  });

  const authResponse = await connect5(mqttConn, {
    clientId: "test",
    properties: {
      authenticationMethod: "SCRAM-SHA-256",
      authenticationData: new Uint8Array([1]),
    },
    checkAck: false,
  });

  assert.strictEqual(authResponse?.type, PacketType.auth);
  assert.strictEqual(
    authResponse?.reasonCode,
    ReasonCode.continueAuthentication,
  );
  assert.deepEqual(
    authResponse?.properties?.authenticationData,
    new Uint8Array([12]),
  );

  const connack = await auth(mqttConn, {
    authMethod: "SCRAM-SHA-256",
    authData: new Uint8Array([2]),
  });

  assert.strictEqual(connack?.type, PacketType.connack);
  assert.strictEqual(
    connack?.reasonCode,
    ReasonCode.success,
  );

  // check if connection is active by sending a qos1 and verifying puback
  await publish5(mqttConn, "test/topic", 1);
});

test("Auth packet re-authentication success transitions state back to connected", async () => {
  const { mqttConn } = startMockServer({
    handlers: { processAuth: successHandler },
  });

  await connect5(mqttConn);
  const response = await auth(mqttConn);
  assert.strictEqual(response?.type, PacketType.auth);
  assert.strictEqual(response?.reasonCode, ReasonCode.success);
  assert.deepStrictEqual(
    response?.properties?.authenticationData,
    new Uint8Array([9, 9]),
  );

  // check if connection is active by sending a qos1 and verifying puback
  await publish5(mqttConn, "test/topic", 1);
});

test("Auth packet re-authentication failure sends DISCONNECT and closes connection", async () => {
  const { mqttConn } = startMockServer({
    handlers: {
      processAuth() {
        return {
          reasonCode: ReasonCode.notAuthorized,
          reasonString: "Re-auth failed",
        };
      },
    },
  });

  await connect5(mqttConn);
  const response = await auth(mqttConn);
  assert.strictEqual(response?.type, PacketType.disconnect);
  assert.strictEqual(response?.reasonCode, ReasonCode.notAuthorized);
  await mqttConn.next();
  assert.strictEqual(mqttConn.isClosed, true);
});

test("Packets are blocked/rejected while state is authenticating", async () => {
  const { mqttConn } = startMockServer({
    handlers: { processAuth: multiStepHandler },
  });

  await connect5(mqttConn);

  // subscribeso we can unsubscribe later
  await subscribe5(mqttConn, [{
    topicFilter: "test/topicToUnsubscribe",
    qos: 0,
  }]);
  // start reauthentication
  await auth(mqttConn);
  // Publish attempt must be rejected with notAuthorized
  const pubResp = await publish5(mqttConn, "test/topic", 1);
  assert.strictEqual(pubResp?.type, PacketType.puback);
  assert.strictEqual(pubResp?.reasonCode, ReasonCode.notAuthorized);

  // Subscribe attempt must be rejected with notAuthorized
  const subResp = await subscribe5(mqttConn, [{
    topicFilter: "test/topic",
    qos: 0,
  }], { checkAcks: false });
  assert.strictEqual(subResp?.type, PacketType.suback);
  assert.strictEqual(subResp?.reasonCodes[0], ReasonCode.notAuthorized);

  // Unsubscribe attempt must return noSubscriptionExisted
  const unsubResp = await unsubscribe5(mqttConn, ["test/topicToUnsubscribe"]);

  assert.strictEqual(unsubResp?.type, PacketType.unsuback);
  assert.strictEqual(unsubResp?.protocolLevel, 5);
  assert.strictEqual(
    unsubResp?.reasonCodes[0],
    ReasonCode.noSubscriptionExisted,
  );
});
