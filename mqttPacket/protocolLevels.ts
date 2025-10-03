/**
 *  MQTT protocol levels
 */

import type { ProtocolLevel } from "./types.ts";

/** available MQTT Protocol levels */
export const MQTTLevel = {
  unknown: undefined as ProtocolLevel,
  v3: 3 as ProtocolLevel,
  v4: 4 as ProtocolLevel,
  v5: 5 as ProtocolLevel,
} as const;
