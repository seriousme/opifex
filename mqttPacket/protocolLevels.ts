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

/** the MQTT protocol level: 3, 4, 5 or undefined */
export type ProtocolLevel = (typeof MQTTLevel)[keyof typeof MQTTLevel];
/** all MQTT protocol levels except 5 */
export type ProtocolLevelNoV5 = Exclude<ProtocolLevel, 5>;
