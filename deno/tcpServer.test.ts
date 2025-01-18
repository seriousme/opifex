import assert from "node:assert/strict";
import { test } from "node:test";
import { TcpServer } from "./tcpServer.ts";

test("Deno testServer", () => {
  const server = new TcpServer({ port: 0 }, {});
  server.start();
  assert.deepStrictEqual(
    server.port !== undefined,
    true,
    "server runs a a random port",
  );
  server.stop();
});