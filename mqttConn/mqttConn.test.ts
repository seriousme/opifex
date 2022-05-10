import { createMqttConn, MqttConnError } from "./mqttConn.ts";
import { AnyPacket, encode } from "./deps.ts";
import { assertEquals, Buffer } from "./dev_deps.ts";
import { PacketType } from "../mqttPacket/types.ts";

const connectPacket: AnyPacket = {
  "type": PacketType.connect,
  "protocolName": "MQTT",
  "protocolLevel": 4,
  "clientId": "testClient",
  "clean": true,
  "keepAlive": 60,
  "username": undefined,
  "password": undefined,
  "will": undefined,
};

const publishPacket: AnyPacket = {
  "type": PacketType.publish,
  "topic": "hello",
  "payload": new Uint8Array([0x77, 0x6f, 0x72, 0x6c, 0x64]), // "world"
  "dup": false,
  "retain": false,
  "qos": 0,
  "id": 0,
};

const disconnectPacket: AnyPacket = {
  "type": PacketType.disconnect,
};

function dummyConn(r: Deno.Reader, w: Deno.Writer): Deno.Conn {
  return {
    rid: -1,
    closeWrite: () => Promise.resolve(),
    read: (x: Uint8Array): Promise<number | null> => r.read(x),
    write: (x: Uint8Array): Promise<number> => w.write(x),
    readable: new ReadableStream({
      type: "bytes",
      async pull(_controller) {
      },
      cancel() {
      },
      autoAllocateChunkSize: 1,
    }),
    writable: new WritableStream({
      async write(_chunk, _controller) {
      },
      close() {
      },
      abort() {
      },
    }),
    close: (): void => {},
    localAddr: { transport: "tcp", hostname: "0.0.0.0", port: 0 },
    remoteAddr: { transport: "tcp", hostname: "0.0.0.0", port: 0 },
  };
}

function dummyReader(buffs: Uint8Array[]): Deno.Reader {
  let idx = 0;
  return {
    read(p: Uint8Array): Promise<number | null> {
      const buff = buffs[idx++];
      if (buff instanceof Uint8Array) {
        p.set(buff);
        return Promise.resolve(buff.byteLength);
      }
      return Promise.resolve(null);
    },
  };
}

Deno.test("MqttConn should act as asyncIterator", async () => {
  const connect = encode(connectPacket);
  const publish = encode(publishPacket);
  const disconnect = encode(disconnectPacket);

  const reader = dummyReader([connect, publish, disconnect]);
  const conn = dummyConn(reader, new Buffer());
  const mqttConn = createMqttConn({ conn });

  const packets = [];
  for await (const packet of mqttConn) {
    packets.push(packet);
  }

  assertEquals(packets.length, 3);
  assertEquals(packets[0], connectPacket);
  assertEquals(packets[1], publishPacket);
  assertEquals(packets[2], disconnectPacket);
});

Deno.test("MqttConn should close on malformed length", async () => {
  const reader = dummyReader([new Uint8Array([1, 175])]);
  const conn = dummyConn(reader, new Buffer());
  const mqttConn = createMqttConn({ conn });

  const packets = [];
  for await (const packet of mqttConn) {
    packets.push(packet);
  }

  assertEquals(packets.length, 0);
  assertEquals(mqttConn.isClosed, true);
  assertEquals(mqttConn.reason, MqttConnError.UnexpectedEof);
});
Deno.test("MqttConn should close on failed packets", async () => {
  const connect = encode(connectPacket);
  const publish = encode(publishPacket);
  const brokenPublish = publish.slice(0, 7);

  const reader = dummyReader([connect, brokenPublish]);
  const conn = dummyConn(reader, new Buffer());
  const mqttConn = createMqttConn({ conn });

  const packets = [];
  for await (const packet of mqttConn) {
    packets.push(packet);
  }

  assertEquals(packets.length, 1);
  assertEquals(packets[0], connectPacket);
  assertEquals(mqttConn.isClosed, true);
  assertEquals(mqttConn.reason, MqttConnError.UnexpectedEof);
});

Deno.test("MqttConn should close on packets too large", async () => {
  const connect = encode(connectPacket);
  const reader = dummyReader([connect]);
  const conn = dummyConn(reader, new Buffer());
  const mqttConn = createMqttConn({ conn, maxPacketSize: 20 });
  const packets = [];
  for await (const packet of mqttConn) {
    packets.push(packet);
  }

  assertEquals(packets.length, 0);
  assertEquals(mqttConn.isClosed, true);
  assertEquals(mqttConn.reason, MqttConnError.packetTooLarge);
});

Deno.test("MqttConn should be writable", async () => {
  const connect = encode(connectPacket);
  const reader = dummyReader([connect]);
  const writer = new Buffer();
  const conn = dummyConn(reader, writer);
  const mqttConn = createMqttConn({ conn });
  await mqttConn.send(connectPacket);
  assertEquals(writer.bytes(), connect);
});
