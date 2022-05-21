import { assert } from "https://deno.land/std@0.140.0/testing/asserts.ts";
import { PublishPacket, Topic } from "./deps.ts";
const maxPacketId = Math.pow(2, 16) - 1;
const maxQueueLength = 42;

export type Packet = PublishPacket;
export type PacketId = number;

export type PacketStore = Map<
  PacketId,
  Packet
>;

export enum ClientState {
    online,
    offline,
  }

export class MemoryStore {
  state: ClientState;
  private packetId: PacketId;
  incomming: PacketStore;
  outgoing: PacketStore;
  pendingOutgoing: PacketStore;
  pendingAckOutgoing: Set<PacketId>;

  constructor() {
    this.packetId = 0;
    this.incomming = new Map();
    this.outgoing = new Map();
    this.pendingOutgoing = new Map();
    this.pendingAckOutgoing = new Set();
    this.state = ClientState.offline;
  }

  nextId(): PacketId {
    const currentId = this.packetId;
    do {
      this.packetId++;
      if (this.packetId > maxPacketId) {
        this.packetId = 0;
      }
    } while (
      (this.outgoing.has(this.packetId) ||
        this.pendingOutgoing.has(this.packetId) ||
        this.pendingAckOutgoing.has(this.packetId)) &&
      (this.packetId !== currentId)
    );
    assert(this.packetId !== currentId, "No unused packetId available");
    return this.packetId;
  }

  publish(topic: Topic, packet: Packet): void {
    // don't queue if there are too many packets in queue
    if (this.outgoing.size > maxQueueLength) {
      return;
    }
    
    // set packetId to client specific id
    const nextId = this.nextId();
    packet.id = nextId;

    // if client is online just send
    if (this.state === ClientState.online) {
      console.log(`Client is online`);
      this.outgoing.set(nextId, packet);
      return;
    }
    // client is offline, enqueue but only for qos > 0
    if ((packet.qos || 0) > 0) {
      this.outgoing.set(nextId, packet);
    }
  }
}

