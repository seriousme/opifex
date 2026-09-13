/**
 *  MQTT protocol levels
 */

/** available MQTT Protocol levels
 * 3.1 = 3
 * 3.1.1 = 4
 * 5.0 = 5
 */
export const MQTTLevel = {
  unknown: undefined,
  v3: 3,
  v4: 4,
  v5: 5,
} as const;

export type ProtocolLevel = (typeof MQTTLevel)[keyof typeof MQTTLevel];
export type ProtocolLevelNoV5 = Exclude<ProtocolLevel, 5>;
