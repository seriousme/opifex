import { PacketType } from "./types.ts";
import { assertEquals } from "./dev_deps.ts";
import { decode, encode } from "./mod.ts";

Deno.test("encode Suback", () => {
  assertEquals(
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

Deno.test("decode Suback", () => {
  assertEquals(
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
