import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getFileData, TcpClient } from "./tcpClient.ts";

// most client testing is already done in tcpServer.test.ts

test("Test getFileData - valid file, empty file and undefined", async () => {
  // Create a unique temporary directory using native NodeJS path/fs utilities
  const tempDir = await mkdtemp(join(tmpdir(), "mqtt-client-test-"));

  const validFilePath = join(tempDir, "valid.txt");
  const emptyFilePath = join(tempDir, "empty.txt");
  const testContent = "Hello MQTT World!";

  try {
    // 1. Test with a valid file containing data
    await writeFile(validFilePath, testContent, "utf-8");
    const result = await getFileData(validFilePath);
    assert.strictEqual(
      result,
      testContent,
      "Should return the correct content of the file",
    );

    // 2. Test with an empty file
    await writeFile(emptyFilePath, "", "utf-8");
    const emptyResult = await getFileData(emptyFilePath);
    assert.strictEqual(
      emptyResult,
      undefined,
      "Should return undefined if the file is empty",
    );
  } finally {
    // Clean up the temporary directory and all its contents
    await rm(tempDir, { recursive: true, force: true });
  }

  // 3. Test with undefined filename
  const undefinedResult = await getFileData(undefined);
  assert.strictEqual(
    undefinedResult,
    undefined,
    "Should return undefined immediately if filename is undefined",
  );
});

test("Test createConn - unsupported protocol", async () => {
  const client = new TcpClient();

  // Use an unsupported protocol like 'ws://' to trigger the throw in createConn
  const invalidParams = {
    url: new URL("ftp://localhost:1883"),
    numberOfRetries: 0,
  };

  // Assert that connect rejects with the specific "Unsupported protocol" error
  await assert.rejects(
    async () => {
      await client.connect(invalidParams);
    },
    {
      name: "Error",
      message: "Unsupported protocol: ftp:",
    },
    "Should throw an error when an unsupported protocol is provided",
  );
});
