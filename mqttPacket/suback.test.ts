import { PacketType } from "./PacketType.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

import { decode, encode } from "./mod.ts";

test("encode Suback", () => {
  assert.deepStrictEqual(
    encode({
      type: PacketType.suback,
      id: 1,
      returnCodes: [0, 1],
    }),
    Uint8Array.from([
      // fixedHeader
      0x90, // packetType + flags
      4, // remainingLength
      // variableHeader
      0, // id MSB
      1, // id LSB
      // payload
      0,
      1,
    ]),
  );
});

test("decode Suback", () => {
  assert.deepStrictEqual(
    decode(
      Uint8Array.from([
        // fixedHeader
        0x90, // packetType + flags
        4, // remainingLength
        // variableHeader
        0, // id MSB
        1, // id LSB
        // payload
        0,
        1,
      ]),
    ),
    {
      type: PacketType.suback,
      id: 1,
      returnCodes: [0, 1],
    },
  );
});
