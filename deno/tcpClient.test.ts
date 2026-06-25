import { test } from "node:test";
import assert from "node:assert/strict";
import { getFileData, TcpClient } from "./tcpClient.ts";

// most client testing is already done in tcpServer.test.ts

test("Deno Test getFileData - valid file, empty file and undefined", async function () {
  // 1. Test with a valid file containing data
  const tempFile = await Deno.makeTempFile({
    prefix: "test_get_file_data_",
    suffix: ".txt",
  });
  const testContent = "Hello MQTT World!";

  try {
    await Deno.writeTextFile(tempFile, testContent);

    const result = await getFileData(tempFile);
    assert.strictEqual(
      result,
      testContent,
      "Should return the correct content of the file",
    );

    // 2. Test with an empty file
    const emptyTempFile = await Deno.makeTempFile({
      prefix: "test_empty_",
      suffix: ".txt",
    });
    try {
      const emptyResult = await getFileData(emptyTempFile);
      assert.strictEqual(
        emptyResult,
        undefined,
        "Should return undefined if the file is empty",
      );
    } finally {
      // Clean up the empty temporary file
      await Deno.remove(emptyTempFile);
    }
  } finally {
    // Clean up the valid temporary file even if assertions fail
    await Deno.remove(tempFile);
  }

  // 3. Test with undefined filename
  const undefinedResult = await getFileData(undefined);
  assert.strictEqual(
    undefinedResult,
    undefined,
    "Should return undefined immediately if filename is undefined",
  );
});

test("Test createConn - unsupported protocol", async function () {
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
