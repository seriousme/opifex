/**
 * @module memoryStore
 */
import { assert } from "./deps.js";
import { maxPacketId, } from "./store.js";
/**
 * In-memory implementation of the IStore interface for managing MQTT packet storage
 */
export class MemoryStore {
    /** Current packet ID counter */
    packetId;
    /** Map of pending incoming packets */
    pendingIncoming;
    /** Map of pending outgoing packets */
    pendingOutgoing;
    /** Map of pending acknowledgment outgoing packets */
    pendingAckOutgoing;
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
    /**
     * Asynchronously yields all pending outgoing packets
     * @yields {PendingOutgoingPackets} Pending outgoing packets
     */
    async *pendingOutgoingPackets() {
        for (const [_id, packet] of this.pendingAckOutgoing) {
            yield packet;
        }
        for (const [_id, packet] of this.pendingOutgoing) {
            yield packet;
        }
    }
}
