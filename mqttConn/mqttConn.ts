/**
 * @module mqttConn
 */

import type {
  AnyPacket,
  CodecOpts,
  LengthDecoderResult,
  ProtocolLevel,
} from "../mqttPacket/mod.ts";

import {
  decodePayload,
  encode,
  getLengthDecoder,
  MQTTLevel,
} from "../mqttPacket/mod.ts";

import { assert } from "../utils/mod.ts";
import type { SockConn } from "../socket/socket.ts";
import { Conn } from "../socket/socket.ts";

/**
 * Common MQTT connection error messages
 */
export const MqttConnError = {
  invalidPacket: "Invalid Packet",
  packetTooLarge: "Packet too large",
  UnexpectedEof: "Unexpected EOF",
} as const;

const DEFAULT_MAX_PACKETSIZE = 2 * 1024 * 1024; // 2MB

/**
 * Interface for MQTT connection handling
 */
export interface IMqttConn extends AsyncIterable<AnyPacket> {
  /** Underlying connection */
  readonly conn: Conn;
  /** Whether connection is closed */
  readonly isClosed: boolean;
  /** Reason for connection closure if any */
  readonly reason: string | undefined;
  /** Async iterator for receiving packets */
  [Symbol.asyncIterator](): AsyncIterableIterator<AnyPacket>;
  /** Send an MQTT packet */
  send(data: AnyPacket): Promise<void>;
  /** Close the connection */
  close(): void;
}

/**
 * Read a single byte from the connection
 * @param conn Connection to read from
 * @returns Single byte as number
 * @throws Error if EOF reached unexpectedly
 */
async function readByte(conn: Conn): Promise<number> {
  const buf = new Uint8Array(1);
  const bytesRead = await conn.read(buf);
  assert(bytesRead !== null, MqttConnError.UnexpectedEof);
  assert(bytesRead !== 0, MqttConnError.UnexpectedEof);
  return buf[0];
}

/**
 * Read exact number of bytes into buffer
 * @param conn Connection to read from
 * @param buf Buffer to read into
 * @throws Error if EOF reached unexpectedly
 */
async function readFull(conn: Conn, buf: Uint8Array): Promise<void> {
  let bytesRead = 0;
  while (bytesRead < buf.length) {
    const read = await conn.read(buf.subarray(bytesRead));
    assert(read !== null, MqttConnError.UnexpectedEof);
    assert(read !== 0, MqttConnError.UnexpectedEof);
    bytesRead += read;
  }
}

/**
 * Read a complete MQTT packet from the connection
 * @param conn Connection to read from
 * @param maxIncomingPacketSize Maximum allowed packet size
 * @returns Decoded MQTT packet
 * @throws Error if packet is invalid or too large
 */
export async function readPacket(
  conn: Conn,
  codecOpts: CodecOpts,
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
  const maxIncomingPacketSize = codecOpts.maxIncomingPacketSize;
  assert(
    remainingLength < maxIncomingPacketSize - 1,
    MqttConnError.packetTooLarge,
  );
  const packetBuf = new Uint8Array(remainingLength);
  // read the rest of the packet
  await readFull(conn, packetBuf);
  const packet = decodePayload(firstByte, packetBuf, codecOpts);
  assert(packet !== null, MqttConnError.UnexpectedEof);
  return packet;
}

/**
 * MQTT Connection class implementing IMqttConn interface
 */
export class MqttConn implements IMqttConn {
  /** Underlying connection */
  readonly conn: Conn;
  /** codecOpts */
  codecOpts: CodecOpts;
  /** Reason for connection closure if any */
  private _reason: string | undefined = undefined;
  /** Whether connection is closed */
  private _isClosed = false;

  /**
   * Create new MQTT connection
   * @param options Connection options
   * @param options.conn Underlying socket connection
   * @param options.maxIncomingPacketSize Maximum allowed incoming packet size (default 2MB)
   * @param options.maxOutGoingPacketSize Maximum allowed outgoing packet size (default 2MB)
   * @param options.protocolLevel Supported protocolLevel
   */
  constructor({
    conn,
    maxIncomingPacketSize = DEFAULT_MAX_PACKETSIZE,
    protocolLevel = MQTTLevel.unknown,
  }: {
    conn: SockConn;
    maxIncomingPacketSize?: number;
    protocolLevel?: ProtocolLevel;
  }) {
    this.conn = new Conn(conn);
    this.codecOpts = {
      maxIncomingPacketSize,
      maxOutgoingPacketSize: maxIncomingPacketSize,
      protocolLevel,
    };
  }

  /** Get reason for connection closure */
  get reason(): string | undefined {
    return this._reason;
  }

  /** Get remoteAdress */
  get remoteAddress(): string {
    if (this.conn.remoteAddr?.transport === "tcp") {
      return this.conn.remoteAddr.hostname;
    }
    return "unknown";
  }

  /**
   * Async iterator for receiving packets
   * @yields MQTT packets
   */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<AnyPacket> {
    while (!this._isClosed) {
      try {
        yield await readPacket(
          this.conn,
          this.codecOpts,
        );
      } catch (err) {
        if (err instanceof Error) {
          if (err.name === "PartialReadError") {
            err.message = MqttConnError.UnexpectedEof;
          }
          this._reason = err.message;
        }
        // packet too large, malformed packet or connection closed
        this.close();
        break;
      }
    }
  }

  /**
   * Send an MQTT packet
   * @param data Packet to send
   */
  async send(data: AnyPacket): Promise<void> {
    try {
      await this.conn.write(encode(data, this.codecOpts));
    } catch (err) {
      if (err instanceof Error) {
        this._reason = err.message;
      }
      this.close();
    }
  }

  /** Whether connection is closed */
  get isClosed(): boolean {
    return this._isClosed;
  }

  /** Close the connection */
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
