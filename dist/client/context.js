import { AsyncQueue, Deferred, logger, MqttConn, PacketType, Timer, } from "./deps.js";
import { handlePacket } from "./handlers/handlePacket.js";
import { ConnectionState } from "./ConnectionState.js";
export class Context {
    mqttConn;
    connectionState;
    pingTimer;
    unresolvedConnect;
    unresolvedPublish;
    unresolvedSubscribe;
    unresolvedUnSubscribe;
    store;
    incoming;
    constructor(store) {
        this.store = store;
        this.connectionState = ConnectionState.offline;
        this.incoming = new AsyncQueue();
        this.unresolvedPublish = new Map();
        this.unresolvedSubscribe = new Map();
        this.unresolvedUnSubscribe = new Map();
    }
    async connect(packet) {
        this.connectionState = ConnectionState.connecting;
        await this.mqttConn?.send(packet);
        const keepAlive = packet.keepAlive || 0;
        if (keepAlive > 0) {
            this.pingTimer = new Timer(this.sendPing.bind(this), keepAlive * 1000, true);
        }
    }
    async disconnect() {
        if (this.connectionState !== ConnectionState.connected) {
            throw "Not connected";
        }
        if (this.mqttConn) {
            this.connectionState = ConnectionState.disconnecting;
            await this.mqttConn.send({ type: PacketType.disconnect });
            this.mqttConn.close();
        }
    }
    async send(packet) {
        logger.debug({ send: packet });
        if (this.connectionState === ConnectionState.connected &&
            !this.mqttConn?.isClosed) {
            await this.mqttConn?.send(packet);
            this.pingTimer?.reset();
            return;
        }
        logger.debug("not connected");
        this.pingTimer?.clear();
    }
    sendPing() {
        this.send({ type: PacketType.pingreq });
    }
    async handleConnection(conn, connectPacket) {
        this.mqttConn = new MqttConn({ conn });
        if (this.mqttConn === undefined) {
            return true;
        }
        logger.debug("Send connect packet");
        await this.connect(connectPacket);
        try {
            logger.debug("Accepting packets");
            for await (const packet of this.mqttConn) {
                handlePacket(this, packet);
            }
            logger.debug("No more packets");
        }
        catch (err) {
            logger.debug(err);
            if (this.mqttConn.isClosed) {
                this.mqttConn.close();
            }
        }
        if (this.connectionState === ConnectionState.disconnecting) {
            return false;
        }
        return true;
    }
    close() {
        logger.debug("closing connection");
        this.connectionState = ConnectionState.disconnected;
        this.pingTimer?.clear();
    }
    receivePublish(packet) {
        this.incoming.push(packet);
    }
    publish(packet) {
        const qos = packet.qos || 0;
        if (qos === 0) {
            packet.id = 0;
            this.send(packet);
            // return empty promise
            return Promise.resolve();
        }
        packet.id = this.store.nextId();
        this.store.pendingOutgoing.set(packet.id, packet);
        const deferred = new Deferred();
        this.unresolvedPublish.set(packet.id, deferred);
        this.send(packet);
        return deferred.promise;
    }
    subscribe(packet) {
        packet.id = this.store.nextId();
        this.store.pendingOutgoing.set(packet.id, packet);
        const deferred = new Deferred();
        this.unresolvedSubscribe.set(packet.id, deferred);
        this.send(packet);
        return deferred.promise;
    }
    unsubscribe(packet) {
        packet.id = this.store.nextId();
        this.store.pendingOutgoing.set(packet.id, packet);
        const deferred = new Deferred();
        this.unresolvedUnSubscribe.set(packet.id, deferred);
        this.send(packet);
        return deferred.promise;
    }
    receivePuback(id) {
        const unresolvedMap = this.unresolvedPublish;
        if (unresolvedMap.has(id)) {
            const deferred = unresolvedMap.get(id);
            unresolvedMap.delete(id);
            deferred?.resolve();
            return true;
        }
        return false;
    }
    // just an alias to clarify protocol flow
    receivePubcomp(id) {
        return this.receivePuback(id);
    }
    receiveSuback(id, returnCodes) {
        const unresolvedMap = this.unresolvedSubscribe;
        if (unresolvedMap.has(id)) {
            const deferred = unresolvedMap.get(id);
            unresolvedMap.delete(id);
            deferred?.resolve(returnCodes);
            return true;
        }
        return false;
    }
    receiveUnsuback(id) {
        const unresolvedMap = this.unresolvedUnSubscribe;
        if (unresolvedMap.has(id)) {
            const deferred = unresolvedMap.get(id);
            unresolvedMap.delete(id);
            deferred?.resolve();
            return true;
        }
        return false;
    }
}
