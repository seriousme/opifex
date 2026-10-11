import { test } from "node:test";
import assert from "node:assert";
import { createConnNextPair as asyncPair } from "./asyncStreamPairToNext.ts";
import { createConnNextPair as webPair } from "./webStreamPairToNext.ts";

const pairs = {
  asyncStream: asyncPair,
  webStream: webPair,
};

for (const [label, createConnNextPair] of Object.entries(pairs)) {
  test(`[${label}]:`, async (t) => {
    await t.test("Echo server shuts down cleanly when client closes input", async () => {
      const { input, output } = createConnNextPair();

      // Run a simple background echo server using the Stream Next model
      const echoPromise = (async () => {
        while (true) {
          const chunk = await output.read();
          if (chunk === null) break; // End of stream reached
          await output.write(chunk);
        }
      })();

      // Client closes their side of the connection
      input.close();

      // The echo server loop should finish successfully without throwing
      await assert.doesNotReject(echoPromise);

      // The client's read call should now return null indicating EOF
      const result = await input.read();
      assert.strictEqual(result, null);
    });

    await t.test("Data written to input.write arrives at input.read", async () => {
      const { input, output } = createConnNextPair();

      // Background echo server
      const echoPromise = (async () => {
        while (true) {
          const chunk = await output.read();
          if (chunk === null) break;
          await output.write(chunk);
        }
      })();

      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      const message = "Hello streaming world!";

      // Write data from the client side
      await input.write(encoder.encode(message));

      // Read back the echoed message
      const result = await input.read();
      assert.notStrictEqual(result, null);
      assert.strictEqual(decoder.decode(result!), message);

      // Close the client side so the echo server finishes cleanly
      input.close();
      await assert.doesNotReject(echoPromise);
    });

    await t.test("Client detects when the echo server abruptly closes its end", async () => {
      const { input, output } = createConnNextPair();
      const encoder = new TextEncoder();

      // Run a server loop that can be manually stopped by closing 'output'
      const echoPromise = (async () => {
        while (true) {
          const chunk = await output.read();
          if (chunk === null) break;
          await output.write(chunk);
        }
      })();

      // --- Simulate Server Shutdown ---
      // The server abruptly closes its end
      output.close();
      await assert.doesNotReject(echoPromise);

      // Client reading should now receive EOF (null)
      const first = await input.read();
      assert.strictEqual(first, null);

      // Subsequent write from the client should reject with a closed pipe error
      await assert.rejects(
        () => input.write(encoder.encode("Is anyone there?")),
        /closed/i,
      );
    });

    await t.test("Data can be written and read sequentially before closing", async () => {
      const { input, output } = createConnNextPair();

      // Background echo server
      const echoPromise = (async () => {
        while (true) {
          const chunk = await output.read();
          if (chunk === null) break;
          await output.write(chunk);
        }
      })();

      const encoder = new TextEncoder();
      const decoder = new TextDecoder();

      // 1. Write & read Chunk 1 sequentially
      await input.write(encoder.encode("Chunk 1"));
      const result1 = await input.read("Chunk 1".length);
      assert.notStrictEqual(result1, null);
      assert.strictEqual(decoder.decode(result1!), "Chunk 1");

      // 2. Write & read Chunk 2 sequentially
      await input.write(encoder.encode("Chunk 2"));
      const result2 = await input.read("Chunk 2".length);
      assert.notStrictEqual(result2, null);
      assert.strictEqual(decoder.decode(result2!), "Chunk 2");

      // 3. Close the client side mid-stream
      input.close();

      // Echo server completes processing gracefully
      await assert.doesNotReject(echoPromise);

      // 4. Verify that further read returns null (EOF)
      const finalResult = await input.read();
      assert.strictEqual(finalResult, null);
    });

    await t.test("Client detects when the echo server abruptly closes its end", async () => {
      const { input, output } = createConnNextPair();
      const encoder = new TextEncoder();

      // Run a server loop that can be manually stopped by closing 'output'
      const echoPromise = (async () => {
        while (true) {
          const chunk = await output.read();
          if (chunk === null) break;
          await output.write(chunk);
        }
      })();

      // --- Simulate Server Shutdown ---
      // The server abruptly closes its end
      output.close();
      await assert.doesNotReject(echoPromise);

      // Client reading should now receive EOF (null)
      const first = await input.read();
      assert.strictEqual(first, null);

      // Subsequent write from the client should reject with a closed pipe error
      await assert.rejects(
        () => input.write(encoder.encode("Is anyone there?")),
        /closed/i,
      );
    });

    await t.test("Repeated close calls are idempotent and do not throw", async () => {
      const { input, output } = createConnNextPair();

      // Multiple close calls on either side should complete safely without throwing
      assert.doesNotThrow(() => {
        input.close();
        input.close();
        output.close();
        output.close();
      });

      const clientRead = await input.read();
      const serverRead = await output.read();

      assert.strictEqual(clientRead, null);
      assert.strictEqual(serverRead, null);
    });
  });
}
