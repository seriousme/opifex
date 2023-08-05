import { assert, PacketId } from "./deps.ts";

import {
  IStore,
  maxPacketId,
  PacketStore,
  PendingAckOutgoing,
  pendingIncoming,
  PendingOutgoing,
  PendingOutgoingPackets,
} from "./store.ts";

export class MemoryStore implements IStore {
  private packetId: PacketId;

  pendingIncoming: PacketStore<pendingIncoming>;
  pendingOutgoing: PacketStore<PendingOutgoing>;
  pendingAckOutgoing: PacketStore<PendingAckOutgoing>;

  constructor() {
    this.packetId = 0;
    this.pendingIncoming = new Map();
    this.pendingOutgoing = new Map();
    this.pendingAckOutgoing = new Map();
  }

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
      (this.packetId !== currentId)
    );
    assert(this.packetId !== currentId, "No unused packetId available");
    return this.packetId;
  }

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
