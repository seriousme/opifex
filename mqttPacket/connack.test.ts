import { PacketType } from "./types.ts";
import { assertEquals, assertThrows } from "./dev_deps.ts";
import { decode, encode } from "./mod.ts";

Deno.test("encode Connack packet", () => {
  assertEquals(
    encode({
      type: PacketType.connack,
      sessionPresent: false,
      returnCode: 0,
    }),
    Uint8Array.from([
      // fixedHeader
      0x20, // packetType + flags
      2, // remainingLength
      // variableHeader
      0, // connack flags
      0, // return code
    ]),
  );
});

Deno.test("decode Connack packet", () => {
  assertEquals(
    decode(
      Uint8Array.from([
        // fixedHeader
        0x20, // packetType + flags
        2, // remainingLength
        // variableHeader
        0, // connack flags
        0, // return code
      ]),
    ),
    {
      type: PacketType.connack,
      sessionPresent: false,
      returnCode: 0,
    },
  );
});

Deno.test("encode Connack with session present", () => {
  assertEquals(
    encode({
      type: PacketType.connack,
      sessionPresent: true,
      returnCode: 0,
    }),
    Uint8Array.from([
      // fixedHeader
      0x20, // packetType + flags
      2, // remainingLength
      // variableHeader
      1, // connack flags (sessionPresent)
      0, // return code
    ]),
  );
});

Deno.test("decode Connack with session present", () => {
  assertEquals(
    decode(
      Uint8Array.from([
        // fixedHeader
        0x20, // packetType + flags
        2, // remainingLength
        // variableHeader
        1, // connack flags (sessionPresent)
        0, // return code
      ]),
    ),
    {
      type: PacketType.connack,
      sessionPresent: true,
      returnCode: 0,
    },
  );
});

Deno.test("decode Connack with non-zero returnCode", () => {
  assertEquals(
    decode(
      Uint8Array.from([
        // fixedHeader
        0x20, // packetType + flags
        2, // remainingLength
        // variableHeader
        0, // connack flags
        4, // return code (bad username or password)
      ]),
    ),
    {
      type: PacketType.connack,
      sessionPresent: false,
      returnCode: 4,
    },
  );
});

Deno.test("decode Connack with invalid returnCode", () => {
  assertThrows(
    () =>
      decode(
        Uint8Array.from([
          // fixedHeader
          0x20, // packetType + flags
          2, // remainingLength
          // variableHeader
          0, // connack flags
          64, // return code (reserved)
        ]),
      ),
    Error,
    "Invalid return code",
  );
});

Deno.test("decode short Connack packets", () => {
  assertThrows(() => decode(Uint8Array.from([0x20])), Error, "decoding failed");
  assertThrows(() => decode(Uint8Array.from([0x20, 2])), Error, "too short");
  assertThrows(() => decode(Uint8Array.from([0x20, 2, 0])), Error, "too long");
});
