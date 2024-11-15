import { assert } from "./deps.js";
import { maxPacketId, } from "./store.js";
export class MemoryStore {
    packetId;
    pendingIncoming;
    pendingOutgoing;
    pendingAckOutgoing;
    constructor() {
        this.packetId = 0;
        this.pendingIncoming = new Map();
        this.pendingOutgoing = new Map();
        this.pendingAckOutgoing = new Map();
    }
    nextId() {
        const currentId = this.packetId;
        do {
            this.packetId++;
            if (this.packetId > maxPacketId) {
                this.packetId = 1;
            }
        } while ((this.pendingIncoming.has(this.packetId) ||
            this.pendingOutgoing.has(this.packetId) ||
            this.pendingAckOutgoing.has(this.packetId)) &&
            this.packetId !== currentId);
        assert(this.packetId !== currentId, "No unused packetId available");
        return this.packetId;
    }
    async *pendingOutgoingPackets() {
        for (const [_id, packet] of this.pendingAckOutgoing) {
            yield packet;
        }
        for (const [_id, packet] of this.pendingOutgoing) {
            yield packet;
        }
    }
}
