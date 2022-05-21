import {
  AnyPacket,
  assert,
  BufReader,
  BufWriter,
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

/** Write MQTT packet to connection */
export async function writePacket(
  writer: BufWriter,
  packet: AnyPacket,
): Promise<void> {
  await writer.write(encode(packet));
  await writer.flush();
}

/** Read MQTT packet from given BufReader
 * @throws `Error` Packet is invalid
 */
export async function readPacket(
  reader: BufReader,
  maxPacketSize: number,
): Promise<AnyPacket> {
  // fixed header is 1 byte of type + flags
  // + a maximum of 4 bytes to encode the remaining length
  const singleByte = new Uint8Array(1);
  const fixedHeader = new Uint8Array(5);
  let firstByte = await reader.readByte();
  assert(firstByte !== null, MqttConnError.UnexpectedEof);
  const decodeLength = getLengthDecoder();
  let byte, result;
  do {
    byte = await reader.readByte();
    assert(byte !== null, MqttConnError.UnexpectedEof);
    result = decodeLength(byte);
  } while (!result.done);

  const remainingLength = result.length;
  assert(
    remainingLength < (maxPacketSize - 1),
    MqttConnError.packetTooLarge,
  );
  const packetBuf = new Uint8Array(remainingLength);
  // read the rest of the packet
  assert(
    await reader.readFull(packetBuf) !== null,
    MqttConnError.UnexpectedEof,
  );
  const packet = decodePayload(firstByte, packetBuf);
  assert(packet !== null, MqttConnError.invalidPacket);
  return packet;
}

export class MqttConn implements IMqttConn {
  readonly conn: SockConn;
  private readonly bufReader: BufReader;
  private readonly bufWriter: BufWriter;
  private readonly maxPacketSize: number;

  constructor({
    conn,
    bufReader,
    bufWriter,
    maxPacketSize,
  }: {
    conn: SockConn;
    bufReader?: BufReader;
    bufWriter?: BufWriter;
    maxPacketSize?: number;
  }) {
    this.conn = conn;
    this.bufReader = bufReader || new BufReader(conn);
    this.bufWriter = bufWriter || new BufWriter(conn);
    this.maxPacketSize = maxPacketSize || 2 * 1024 * 1024;
  }

  private _reason = undefined;
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
      await writePacket(this.bufWriter, data);
    } catch {
      this.close();
    }
  }

  private _isClosed = false;
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
