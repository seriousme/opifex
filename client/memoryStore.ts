import { assert } from "https://deno.land/std@0.140.0/testing/asserts.ts";
import {
  PacketId,
  PublishPacket,
  SubscribePacket,
  UnsubscribePacket,
} from "./deps.ts";
const maxPacketId = 0xffff;

export type PacketStore<T> = Map<
  PacketId,
  T
>;

export class MemoryStore {
  private packetId: PacketId;

  pendingIncomming: PacketStore<PublishPacket>;
  pendingOutgoing: PacketStore<
    PublishPacket | SubscribePacket | UnsubscribePacket
  >;
  pendingAckOutgoing: Set<PacketId>;

  constructor() {
    this.packetId = 0;
    this.pendingIncomming = new Map();
    this.pendingOutgoing = new Map();
    this.pendingAckOutgoing = new Set();
  }

  nextId(): PacketId {
    const currentId = this.packetId;
    do {
      this.packetId++;
      if (this.packetId > maxPacketId) {
        this.packetId = 1;
      }
    } while (
      (this.pendingIncomming.has(this.packetId) ||
        this.pendingOutgoing.has(this.packetId) ||
        this.pendingAckOutgoing.has(this.packetId)) &&
      (this.packetId !== currentId)
    );
    assert(this.packetId !== currentId, "No unused packetId available");
    return this.packetId;
  }
}
