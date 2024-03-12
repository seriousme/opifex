import { TcpServer } from "./server.ts";
import { assert } from "../utils/mod.ts";
import { test } from "bun:test";

test("testServer", () => {
  const server = new TcpServer({ port: 1883, hostname: "::" }, {});
  server.start();
  assert(
    server.port !== undefined,
    "server runs on a random port",
  );
  server.stop();
});
