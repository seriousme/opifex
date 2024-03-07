import {
  AnyPacket,
  decodePayload,
  encode,
  getLengthDecoder,
  LengthDecoderResult,
} from "../mqttPacket/mod.ts";

import { assert } from "../utils/mod.ts";
import { SockConn } from "../socket/socket.ts";

export enum MqttConnError {
  invalidPacket = "Invalid Packet",
  packetTooLarge = "Packet too large",
  UnexpectedEof = "Unexpected EOF",
}

export interface IMqttConn extends AsyncIterable<AnyPacket> {
  readonly conn: SockConn;
  readonly isClosed: boolean;
  readonly reason: string | undefined;
  [Symbol.asyncIterator](): AsyncIterableIterator<AnyPacket>;
  send(data: AnyPacket): Promise<void>;
  close(): void;
}

async function readByte(conn: SockConn): Promise<number> {
  const buf = new Uint8Array(1);
  const bytesRead = await conn.read(buf);
  assert(bytesRead !== null, MqttConnError.UnexpectedEof);
  assert(bytesRead !== 0, MqttConnError.UnexpectedEof);
  return buf[0];
}

async function readFull(conn: SockConn, buf: Uint8Array): Promise<void> {
  let bytesRead = 0;
  while (bytesRead < buf.length) {
    const read = await conn.read(buf.subarray(bytesRead));
    assert(read !== null, MqttConnError.UnexpectedEof);
    assert(read !== 0, MqttConnError.UnexpectedEof);
    bytesRead += read;
  }
}

/** Read MQTT packet
 * @throws `Error` if packet is invalid
 */
export async function readPacket(
  conn: SockConn,
  maxPacketSize: number,
): Promise<AnyPacket> {
  // fixed header is 1 byte of type + flags
  // + a maximum of 4 bytes to encode the remaining length
  const decodeLength = getLengthDecoder();
  const firstByte = await readByte(conn);
  let result: LengthDecoderResult;
  do {
    const byte = await readByte(conn);
    result = decodeLength(byte);
  } while (!result.done);

  const remainingLength = result.length;
  assert(remainingLength < maxPacketSize - 1, MqttConnError.packetTooLarge);
  const packetBuf = new Uint8Array(remainingLength);
  // read the rest of the packet
  await readFull(conn, packetBuf);
  const packet = decodePayload(firstByte, packetBuf);
  assert(packet !== null, MqttConnError.UnexpectedEof);
  return packet;
}

export class MqttConn implements IMqttConn {
  readonly conn: SockConn;
  private readonly maxPacketSize: number;
  private _reason: string | undefined = undefined;
  private _isClosed = false;

  constructor({
    conn,
    maxPacketSize,
  }: {
    conn: SockConn;
    maxPacketSize?: number;
  }) {
    this.conn = conn;
    this.maxPacketSize = maxPacketSize || 2 * 1024 * 1024;
  }

  get reason(): string | undefined {
    return this._reason;
  }

  async *[Symbol.asyncIterator](): AsyncIterableIterator<AnyPacket> {
    while (!this._isClosed) {
      try {
        yield await readPacket(this.conn, this.maxPacketSize);
      } catch (err) {
        if (err.name === "PartialReadError") {
          err.message = MqttConnError.UnexpectedEof;
        }
        this._reason = err.message;
        // packet too large, malformed packet or connection closed
        this.close();
        break;
      }
    }
  }

  async send(data: AnyPacket): Promise<void> {
    try {
      await this.conn.write(encode(data));
    } catch {
      this.close();
    }
  }

  get isClosed(): boolean {
    return this._isClosed;
  }

  close(): void {
    if (this.isClosed) return;
    try {
      this.conn.close();
    } catch (e) {
      console.error(e);
    } finally {
      this._isClosed = true;
    }
  }
}
