import { TcpServer } from "./server.ts";
import { assertEquals } from "../dev_utils/mod.ts";

Deno.test("testServer", () => {
  const server = new TcpServer({ port: 0 }, {});
  server.start();
  assertEquals(
    server.port !== undefined,
    true,
    "server runs a a random port",
  );
  server.stop();
});
