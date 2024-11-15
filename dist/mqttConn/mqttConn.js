import { decodePayload, encode, getLengthDecoder, } from "../mqttPacket/mod.js";
import { assert } from "../utils/mod.js";
import { Conn } from "../socket/socket.js";
export const MqttConnError = {
    invalidPacket: "Invalid Packet",
    packetTooLarge: "Packet too large",
    UnexpectedEof: "Unexpected EOF",
};
async function readByte(conn) {
    const buf = new Uint8Array(1);
    const bytesRead = await conn.read(buf);
    assert(bytesRead !== null, MqttConnError.UnexpectedEof);
    assert(bytesRead !== 0, MqttConnError.UnexpectedEof);
    return buf[0];
}
async function readFull(conn, buf) {
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
export async function readPacket(conn, maxPacketSize) {
    // fixed header is 1 byte of type + flags
    // + a maximum of 4 bytes to encode the remaining length
    const decodeLength = getLengthDecoder();
    const firstByte = await readByte(conn);
    let result;
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
export class MqttConn {
    conn;
    maxPacketSize;
    _reason = undefined;
    _isClosed = false;
    constructor({ conn, maxPacketSize, }) {
        this.conn = new Conn(conn);
        this.maxPacketSize = maxPacketSize || 2 * 1024 * 1024;
    }
    get reason() {
        return this._reason;
    }
    async *[Symbol.asyncIterator]() {
        while (!this._isClosed) {
            try {
                yield await readPacket(this.conn, this.maxPacketSize);
            }
            catch (err) {
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
    async send(data) {
        try {
            await this.conn.write(encode(data));
        }
        catch (err) {
            if (err instanceof Error) {
                this._reason = err.message;
            }
            this.close();
        }
    }
    get isClosed() {
        return this._isClosed;
    }
    close() {
        if (this.isClosed)
            return;
        try {
            this.conn.close();
        }
        catch (e) {
            console.error(e);
        }
        finally {
            this._isClosed = true;
        }
    }
}
