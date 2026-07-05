/**
 * Shared helpers for Sqlite-backed stores.
 */

import type { PublishPacket } from "../../mqttPacket/publish.ts";
import type { ClientId } from "../../mqttPacket/types.ts";

export type SerializedPacket = {
  packet: string;
  payload: Uint8Array | null;
};

export type SessionParameters = {
  clientId: ClientId;
  existingSession: boolean;
};

export function serializePacket(packet: PublishPacket): SerializedPacket {
  const payload = packet.payload?.byteLength ? packet.payload : null;
  const packetData = {
    ...packet,
    payload: undefined,
  };
  return {
    packet: JSON.stringify(packetData),
    payload,
  };
}

export function deserializePacket(
  packet: string,
  payload: Uint8Array | null,
): PublishPacket {
  const data = JSON.parse(packet);
  if (payload !== null) {
    data.payload = payload;
  }
  return data as PublishPacket;
}
