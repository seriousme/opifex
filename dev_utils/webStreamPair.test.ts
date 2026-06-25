import { test } from "node:test";
import assert from "node:assert";
import { createWebStreamPair } from "./webStreamPair.ts";

test("Echo server shuts down cleanly when client closes input", async () => {
  const { input, output } = createWebStreamPair();

  const echoPromise = output.readable.pipeTo(output.writable);

  const writer = input.writable.getWriter();
  const reader = input.readable.getReader();

  // Client closes their side
  await writer.close();

  // The echo server's pipeTo should resolve and finish successfully
  await assert.doesNotReject(echoPromise);

  // The client's reader should now receive the end-of-stream signal
  const { done } = await reader.read();
  assert.strictEqual(done, true);

  writer.releaseLock();
  reader.releaseLock();
});

test("Data written to input.writable arrives at output.readable", async () => {
  const { input, output } = createWebStreamPair();

  const echoPromise = output.readable.pipeTo(output.writable);

  const writer = input.writable.getWriter();
  const reader = input.readable.getReader();

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  // Write data to the input side
  await writer.write(encoder.encode("Hello streaming world!"));
  await writer.close(); // Close the stream after writing

  // The echo server's pipeTo should resolve and finish successfully
  await assert.doesNotReject(echoPromise);

  // Read the data from the input side
  const chunks: Uint8Array[] = [];

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }

  // Combine chunks and decode to string
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const resultUint8 = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    resultUint8.set(chunk, offset);
    offset += chunk.length;
  }

  const readText = decoder.decode(resultUint8);

  // Verify the text matches exactly
  assert.strictEqual(readText, "Hello streaming world!");
  reader.releaseLock();
});

test("Data can be written and read sequentially before closing", async () => {
  const { input, output } = createWebStreamPair();
  const echoPromise = output.readable.pipeTo(output.writable);

  const writer = input.writable.getWriter();
  const reader = input.readable.getReader();

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  // 1. First Write & Read chunk
  await writer.write(encoder.encode("Chunk 1"));
  const result1 = await reader.read();
  assert.strictEqual(result1.done, false);
  assert.strictEqual(decoder.decode(result1.value), "Chunk 1");

  // 2. Second Write & Read chunk
  await writer.write(encoder.encode("Chunk 2"));
  const result2 = await reader.read();
  assert.strictEqual(result2.done, false);
  assert.strictEqual(decoder.decode(result2.value), "Chunk 2");

  // 3. Now we close the writable side mid-stream
  await writer.close();

  // The echo server's pipeTo should resolve and finish successfully
  await assert.doesNotReject(echoPromise);

  // 4. Verify that the readable side now registers the close signal
  const finalResult = await reader.read();
  assert.strictEqual(finalResult.done, true);
  assert.strictEqual(finalResult.value, undefined);

  writer.releaseLock();
  reader.releaseLock();
});

test("Client detects when the echo server abruptly closes its end", async () => {
  const { input, output } = createWebStreamPair();
  const encoder = new TextEncoder();

  // Set up a manual echo server so we can manipulate its controls
  const serverReader = output.readable.getReader();
  const serverWriter = output.writable.getWriter();

  // Start a basic manual loop in the background
  const serverLoop = (async () => {
    try {
      while (true) {
        const { value, done } = await serverReader.read();
        if (done) break;
        await serverWriter.write(value);
      }
    } finally {
      serverReader.releaseLock();
      serverWriter.releaseLock();
    }
  })();

  const clientWriter = input.writable.getWriter();
  const clientReader = input.readable.getReader();

  // --- Simulate Server Shutdown ---
  // The echo server decides to close its writing side out of nowhere
  try {
    await serverWriter.close();
    await serverReader.cancel();
    await serverLoop;

    const first = await clientReader.read();
    assert.strictEqual(first.done, true);

    await assert.rejects(
      () => clientWriter.write(encoder.encode("Is anyone there?")),
      /close|invalid/i,
    );
  } finally {
    clientWriter.releaseLock();
    clientReader.releaseLock();
  }
});
