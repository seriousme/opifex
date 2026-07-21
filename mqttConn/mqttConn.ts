/**
 * @module mqttConn
 */

import type {
  AnyPacket,
  CodecOpts,
  LengthDecoderResult,
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
  connectPacketTooLarge: "Connect Packet too large",
  UnexpectedEof: "Unexpected EOF",
} as const;

const DEFAULT_MAX_PACKETSIZE = 2 * 1024; // 2Kb

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
  const buff = await conn.read(1);
  assert(buff !== null, MqttConnError.UnexpectedEof);
  assert(buff !== undefined, MqttConnError.UnexpectedEof);
  assert(buff.byteLength !== 0, MqttConnError.UnexpectedEof);
  return buff[0] || 0;
}

/**
 * Read exact number of bytes into buffer
 * @param conn Connection to read from
 * @param buf Buffer to read into
 * @throws Error if EOF reached unexpectedly
 */
async function readFull(conn: Conn, length: number): Promise<Uint8Array> {
  const buff = await conn.read(length);
  assert(buff !== null, MqttConnError.UnexpectedEof);
  assert(buff.byteLength === length, MqttConnError.UnexpectedEof);
  return buff;
}

/**
 * Read a complete MQTT packet from the connection
 * @param conn Connection to read from
 * @param codecOpts the CodecOpts
 * @returns Decoded MQTT packet
 * @throws Error if packet is invalid or too large
 */
export async function readPacket(
  conn: Conn,
  codecOpts: CodecOpts,
  maxConnectPacketSize: number,
): Promise<AnyPacket> {
  // fixed header is 1 byte of type + flags
  // + a maximum of 4 bytes to encode the remaining length
  const decodeLength = getLengthDecoder();
  const firstByte = await readByte(conn);
  const isConnect = (firstByte >> 4) === 1;
  let result: LengthDecoderResult;
  do {
    const byte = await readByte(conn);
    result = decodeLength(byte);
  } while (!result.done);

  const remainingLength = result.length;
  if (isConnect) {
    assert(
      remainingLength < maxConnectPacketSize - 1,
      MqttConnError.connectPacketTooLarge,
    );
  }
  const maxIncomingPacketSize = codecOpts.maxIncomingPacketSize;
  assert(
    remainingLength < maxIncomingPacketSize - 1,
    MqttConnError.packetTooLarge,
  );
  // read the rest of the packet
  const packetBuf = await readFull(conn, remainingLength);
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
  /** Maximum Connect packet size */
  readonly maxConnectPacketSize: number;
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
   * @param options.maxConnectPacketSize Maximum allowed connect packet size
   * @param options.maxIncomingPacketSize Maximum allowed incoming packet size
   * @param options.maxOutGoingPacketSize Maximum allowed outgoing packet size
   * @param options.protocolLevel Supported protocolLevel
   */
  constructor(
    options:
      & { conn: SockConn; maxConnectPacketSize?: number }
      & Partial<CodecOpts>,
  ) {
    this.conn = new Conn(options.conn);
    this.maxConnectPacketSize = options.maxConnectPacketSize ??
      DEFAULT_MAX_PACKETSIZE;
    this.codecOpts = {
      maxIncomingPacketSize: options.maxIncomingPacketSize ??
        DEFAULT_MAX_PACKETSIZE,
      maxOutgoingPacketSize: options.maxOutgoingPacketSize ??
        DEFAULT_MAX_PACKETSIZE,
      protocolLevel: options.protocolLevel ?? MQTTLevel.unknown,
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
   * Returns incoming MQTT packages until the connection is closed. Note that
   * the connection will close automatically upon receiving an invalid packet.
   *
   * @returns a Promise that resolves to AnyPacket if the connection is open
   *          and working nominally, undefined otherwise.
   */
  async #receive(): Promise<AnyPacket | undefined> {
    if (!this._isClosed) {
      try {
        return await readPacket(
          this.conn,
          this.codecOpts,
          this.maxConnectPacketSize,
        );
      } catch (err) {
        if (err instanceof Error) {
          if (err.name === "PartialReadError") {
            err.message = MqttConnError.UnexpectedEof;
          }
          this._reason = err.message;
        }
        // packet too large, malformed packet or connection closed.
        this.close();
        return undefined;
      }
    }
    return Promise.resolve(undefined);
  }

  /** Return next packet. */
  async next(): Promise<IteratorResult<AnyPacket>> {
    const packet = await this.#receive();

    if (packet !== undefined) {
      return { value: packet, done: false };
    }

    return { value: undefined, done: true };
  }

  /** Async iterator. */
  [Symbol.asyncIterator](): this {
    return this;
  }

  /**
   * Send an MQTT packet
   * @param data Packet to send
   */
  async send(data: AnyPacket): Promise<void> {
    if (!this._isClosed) {
      try {
        await this.conn.write(encode(data, this.codecOpts));
      } catch (err) {
        if (err instanceof Error) {
          this._reason = err.message;
        }
        this.close();
      }
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
