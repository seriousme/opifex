/**
 * @module memoryStore
 */

import { assert } from "./deps.ts";
import type { PacketId } from "./deps.ts";

import {
  type IStore,
  maxPacketId,
  type PacketStore,
  type PendingAckOutgoing,
  type pendingIncoming,
  type PendingOutgoing,
  type PendingOutgoingPackets,
} from "./store.ts";

/**
 * In-memory implementation of the IStore interface for managing MQTT packet storage
 */
export class MemoryStore implements IStore {
  /** Current packet ID counter */
  private packetId: PacketId;

  /** Map of pending incoming packets */
  pendingIncoming: PacketStore<pendingIncoming>;

  /** Map of pending outgoing packets */
  pendingOutgoing: PacketStore<PendingOutgoing>;

  /** Map of pending acknowledgment outgoing packets */
  pendingAckOutgoing: PacketStore<PendingAckOutgoing>;

  /**
   * Creates a new MemoryStore instance
   */
  constructor() {
    this.packetId = 0;
    this.pendingIncoming = new Map();
    this.pendingOutgoing = new Map();
    this.pendingAckOutgoing = new Map();
  }

  /**
   * Generates the next available packet ID
   * @returns {PacketId} The next available packet ID
   * @throws {Error} If no unused packet ID is available
   */
  nextId(): PacketId {
    const currentId = this.packetId;
    do {
      this.packetId++;
      if (this.packetId > maxPacketId) {
        this.packetId = 1;
      }
    } while (
      (this.pendingIncoming.has(this.packetId) ||
        this.pendingOutgoing.has(this.packetId) ||
        this.pendingAckOutgoing.has(this.packetId)) &&
      this.packetId !== currentId
    );
    assert(this.packetId !== currentId, "No unused packetId available");
    return this.packetId;
  }

  /**
   * Asynchronously yields all pending outgoing packets
   * @yields {PendingOutgoingPackets} Pending outgoing packets
   */
  async *pendingOutgoingPackets(): AsyncGenerator<
    PendingOutgoingPackets,
    void,
    unknown
  > {
    for (const [_id, packet] of this.pendingAckOutgoing) {
      yield packet;
    }
    for (const [_id, packet] of this.pendingOutgoing) {
      yield packet;
    }
  }
}
