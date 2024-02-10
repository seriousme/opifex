import { BitMask, ClientId, PacketType, Payload, QoS, Topic } from "./types.ts";
import { Encoder } from "./encoder.ts";
import {
	booleanFlag,
	Decoder,
	DecoderError,
	hasEmptyFlags,
} from "./decoder.ts";

export type ConnectPacket = {
	type: PacketType.connect;
	protocolName?: string;
	protocolLevel?: number;
	clientId?: ClientId;
	username?: string;
	password?: Uint8Array;
	will?: {
		topic: Topic;
		payload: Payload;
		retain?: boolean;
		qos?: QoS;
	};
	clean?: boolean;
	keepAlive?: number;
};

function invalidProtocolName(version: number, name: string): boolean {
	if (version === 4 && name !== "MQTT") {
		return true;
	}
	return false;
}

export default {
	encode(packet: ConnectPacket) {
		const flags = 0;

		const protocolLevel = 4;
		const protocolName = protocolLevel === 4 ? "MQTT" : "MQIsdp";
		const clientId = packet.clientId || "";
		const usernameFlag = !!packet.username;
		const passwordFlag = !!packet.password;
		const willRetain = !!packet.will?.retain;
		const willQoS = packet.will?.qos || 0;
		const willFlag = !!packet.will;
		const cleanSession = packet.clean !== false;
		const connectFlags =
			(usernameFlag ? BitMask.bit7 : 0) +
			(passwordFlag ? BitMask.bit6 : 0) +
			(willRetain ? BitMask.bit5 : 0) +
			(willQoS & 2 ? BitMask.bit4 : 0) +
			(willQoS & 1 ? BitMask.bit3 : 0) +
			(willFlag ? BitMask.bit2 : 0) +
			(cleanSession ? BitMask.bit1 : 0);
		const keepAlive = packet.keepAlive || 0;

		const encoder = new Encoder();
		encoder
			.setUtf8String(protocolName)
			.setByte(protocolLevel)
			.setByte(connectFlags)
			.setInt16(keepAlive)
			.setUtf8String(clientId);

		if (packet.will) {
			encoder.setTopic(packet.will.topic).setByteArray(packet.will.payload);
		}

		if (packet.username) {
			encoder.setUtf8String(packet.username);
		}

		if (packet.password) {
			encoder.setByteArray(packet.password);
		}
		return { flags, bytes: encoder.done() };
	},

	decode(buffer: Uint8Array, flags: number): ConnectPacket {
		const decoder = new Decoder(buffer);
		const protocolName = decoder.getUtf8String();
		const protocolLevel = decoder.getByte();
		if (invalidProtocolName(protocolLevel, protocolName)) {
			throw new DecoderError("Invalid protocol name");
		}

		const connectFlags = decoder.getByte();

		const usernameFlag = booleanFlag(connectFlags, BitMask.bit7);
		const passwordFlag = booleanFlag(connectFlags, BitMask.bit6);
		const willRetain = booleanFlag(connectFlags, BitMask.bit5);
		const willQoS = (connectFlags & (BitMask.bit4 + BitMask.bit3)) >> 3;
		const willFlag = booleanFlag(connectFlags, BitMask.bit2);
		const cleanSession = booleanFlag(connectFlags, BitMask.bit1);
		const reservedBit = booleanFlag(connectFlags, BitMask.bit0);

		hasEmptyFlags(flags);
		// The Server MUST validate that the reserved flag in the CONNECT Control Packet
		// is set to zero and disconnect the Client if it is not zero [MQTT-3.1.2-3].
		if (reservedBit) {
			throw new DecoderError("Invalid reserved bit");
		}

		if (willQoS !== 0 && willQoS !== 1 && willQoS !== 2) {
			throw new DecoderError("Invalid will qos");
		}

		const keepAlive = decoder.getInt16();
		const clientId = decoder.getUtf8String();

		let willTopic;
		let willPayload;
		if (willFlag) {
			willTopic = decoder.getTopic();
			willPayload = decoder.getByteArray();
		}

		let username;
		let password;
		if (usernameFlag) {
			username = decoder.getUtf8String();
		}

		if (passwordFlag) {
			password = decoder.getByteArray();
		}

		decoder.done();
		if (!willFlag && (willQoS !== 0 || willRetain === true)) {
			throw new DecoderError(
				"Will QoS must be 0 and Will retain to false when Will flag is false",
			);
		}

		if (clientId.length === 0 && cleanSession === false) {
			throw new DecoderError("Clean session must be true if clientID is empty");
		}

		return {
			type: PacketType.connect,
			protocolName: protocolName,
			protocolLevel,
			clientId: clientId,
			username: username ? username : undefined,
			password: password ? password : undefined,
			will: willFlag
				? {
						topic: willTopic || "",
						payload: willPayload || Uint8Array.from([0]),
						retain: willRetain,
						qos: willQoS,
				  }
				: undefined,
			clean: cleanSession,
			keepAlive,
		};
	},
};
