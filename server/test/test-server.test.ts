import { testServer } from "./test-server.ts";
import { assertEquals } from "./dev_deps.ts";

Deno.test("testServer", () => {
  const server = new testServer();
  server.start();
  assertEquals(
    server.port() !== undefined,
    true,
    "server runs a a random port",
  );
  server.stop();
});
