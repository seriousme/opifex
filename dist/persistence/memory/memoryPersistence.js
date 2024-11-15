import { Trie, } from "../deps.js";
import { assert } from "../../utils/mod.js";
const maxPacketId = 0xffff;
export class MemoryStore {
    clientId;
    packetId;
    pendingIncoming;
    pendingOutgoing;
    pendingAckOutgoing;
    subscriptions;
    constructor(clientId) {
        this.packetId = 0;
        this.pendingIncoming = new Map();
        this.pendingOutgoing = new Map();
        this.pendingAckOutgoing = new Set();
        this.subscriptions = new Map();
        this.clientId = clientId;
    }
    nextId() {
        const currentId = this.packetId;
        do {
            this.packetId++;
            if (this.packetId > maxPacketId) {
                this.packetId = 0;
            }
        } while ((this.pendingOutgoing.has(this.packetId) ||
            this.pendingAckOutgoing.has(this.packetId)) &&
            this.packetId !== currentId);
        assert(this.packetId !== currentId, "No unused packetId available");
        return this.packetId;
    }
}
export class MemoryPersistence {
    clientList;
    retained;
    trie;
    constructor() {
        this.clientList = new Map();
        this.retained = new Map();
        this.trie = new Trie(true);
    }
    registerClient(clientId, handler, clean) {
        const existingClient = this.clientList.get(clientId);
        const store = !clean && existingClient
            ? existingClient.store
            : new MemoryStore(clientId);
        this.clientList.set(clientId, { store, handler });
        return store;
    }
    deregisterClient(clientId) {
        const client = this.clientList.get(clientId);
        if (client) {
            this.unsubscribeAll(client.store);
            this.clientList.delete(clientId);
        }
    }
    subscribe(store, topicFilter, qos) {
        const clientId = store.clientId;
        if (!store.subscriptions.has(topicFilter)) {
            store.subscriptions.set(topicFilter, qos);
            this.trie.add(topicFilter, { clientId, qos });
        }
    }
    unsubscribe(store, topicFilter) {
        const clientId = store.clientId;
        const qos = store.subscriptions.get(topicFilter);
        if (qos) {
            store.subscriptions.delete(topicFilter);
            this.trie.remove(topicFilter, { clientId, qos });
        }
    }
    unsubscribeAll(store) {
        for (const [topicFilter, _qos] of store.subscriptions) {
            this.unsubscribe(store, topicFilter);
        }
    }
    publish(topic, packet) {
        if (packet.retain) {
            this.retained.set(packet.topic, packet);
            if (packet.payload === undefined) {
                this.retained.delete(packet.topic);
            }
        }
        // dedup clients
        const clients = new Map();
        for (const { clientId, qos } of this.trie.match(topic)) {
            const prevQos = clients.get(clientId);
            if (!prevQos || prevQos < qos) {
                clients.set(clientId, qos);
            }
        }
        // publish the message to all clients
        for (const [clientId, qos] of clients) {
            const newPacket = Object.assign({}, packet);
            newPacket.retain = false;
            newPacket.qos = qos;
            //  logger.debug(`publish ${topic} to client ${clientId}`);
            const client = this.clientList.get(clientId);
            client?.handler(packet);
        }
    }
    handleRetained(clientId) {
        const retainedTrie = new Trie();
        const client = this.clientList.get(clientId);
        const store = client?.store;
        if (store) {
            for (const [topicFilter, _qos] of store.subscriptions) {
                retainedTrie.add(topicFilter, clientId);
            }
            for (const [topic, packet] of this.retained) {
                if (retainedTrie.match(topic).length > 0) {
                    client?.handler(packet);
                }
            }
        }
    }
}
