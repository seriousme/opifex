export enum PacketType {
	reserved = 0,
	connect = 1,
	connack = 2,
	publish = 3,
	puback = 4,
	pubrec = 5,
	pubrel = 6,
	pubcomp = 7,
	subscribe = 8,
	suback = 9,
	unsubscribe = 10,
	unsuback = 11,
	pingreq = 12,
	pingres = 13,
	disconnect = 14,
}

export enum BitMask {
	bit0 = 2 ** 0,
	bit1 = 2 ** 1,
	bit2 = 2 ** 2,
	bit3 = 2 ** 3,
	bit4 = 2 ** 4,
	bit5 = 2 ** 5,
	bit6 = 2 ** 6,
	bit7 = 2 ** 7,
}

export type QoS = 0 | 1 | 2;

export type Payload = Uint8Array;

export type Topic = string;

export type TopicFilter = string;

export type Dup = boolean;

export type PacketId = number;

export type ReturnCodes = number[];

export type ClientId = string;
