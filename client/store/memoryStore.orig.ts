import { assert } from "https://deno.land/std@0.140.0/testing/asserts.ts";
import {
  PacketId,
  PublishPacket,
  PubrelPacket,
  SubscribePacket,
  UnsubscribePacket,
} from "./deps.ts";
const maxPacketId = 0xffff;

export type PacketStore<T> = Map<
  PacketId,
  T
>;

type PendingOutgoing = PublishPacket | SubscribePacket | UnsubscribePacket;
type PendingAckOutgoing = PubrelPacket;
type PendingOutgoingPackets = PendingAckOutgoing | PendingOutgoing;

export class MemoryStore {
  private packetId: PacketId;

  pendingIncoming: PacketStore<PublishPacket>;
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
    PendingOutgoing | PubrelPacket,
    void,
    unknown
  > {
    for (const [id, packet] of this.pendingAckOutgoing) {
      yield packet;
    }
    for (const [id, packet] of this.pendingOutgoing) {
      yield packet;
    }
  }
}
