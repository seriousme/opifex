import {
  AnyPacket,
  BufReader,
  decodePayload,
  encode,
  getLengthDecoder,
} from "./deps.ts";

export type SockConn = Deno.Conn;

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

function assert(expr: unknown, msg = ""): asserts expr {
  if (!expr) {
    throw new Error(msg);
  }
}

/** Read MQTT packet from given BufReader
 * @throws `Error` if packet is invalid
 */
export async function readPacket(
  reader: BufReader,
  maxPacketSize: number,
): Promise<AnyPacket> {
  // fixed header is 1 byte of type + flags
  // + a maximum of 4 bytes to encode the remaining length
  const firstByte = await reader.readByte();
  assert(firstByte !== null, MqttConnError.UnexpectedEof);
  const decodeLength = getLengthDecoder();
  let byte, result;
  do {
    byte = await reader.readByte();
    assert(byte !== null, MqttConnError.UnexpectedEof);
    result = decodeLength(byte);
  } while (!result.done);

  const remainingLength = result.length;
  assert(remainingLength < (maxPacketSize - 1), MqttConnError.packetTooLarge);
  const packetBuf = new Uint8Array(remainingLength);
  // read the rest of the packet
  assert(
    await reader.readFull(packetBuf) !== null,
    MqttConnError.UnexpectedEof,
  );
  const packet = decodePayload(firstByte, packetBuf);
  assert(packet !== null, MqttConnError.UnexpectedEof);
  return packet;
}

export class MqttConn implements IMqttConn {
  readonly conn: SockConn;
  private readonly bufReader: BufReader;
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
    this.bufReader = new BufReader(conn);
    this.maxPacketSize = maxPacketSize || 2 * 1024 * 1024;
  }

  get reason(): string | undefined {
    return this._reason;
  }

  async *[Symbol.asyncIterator](): AsyncIterableIterator<AnyPacket> {
    while (!this._isClosed) {
      try {
        yield await readPacket(this.bufReader, this.maxPacketSize);
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
