export const PacketType = {
    reserved: 0,
    connect: 1,
    connack: 2,
    publish: 3,
    puback: 4,
    pubrec: 5,
    pubrel: 6,
    pubcomp: 7,
    subscribe: 8,
    suback: 9,
    unsubscribe: 10,
    unsuback: 11,
    pingreq: 12,
    pingres: 13,
    disconnect: 14,
};
export const PacketNameByType = Object.fromEntries(Object.entries(PacketType).map(([k, v]) => [v, k]));
