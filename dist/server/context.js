import { logger, MqttConn, PacketNameByType, PacketType, } from "./deps.js";
export const SysPrefix = "$";
export const utf8Encoder = new TextEncoder();
/**
 * The Context class is used to maintain state of a MQTT connection
 * It handles:
 *  - connect/disconnect including broadcasting of these events
 *  - publish
 *  - persistence
 *  - the will
 */
export class Context {
    connected;
    conn;
    mqttConn;
    persistence;
    handlers;
    static clientList = new Map();
    store;
    will;
    timer;
    constructor(persistence, conn, handlers) {
        this.persistence = persistence;
        this.connected = false;
        this.conn = conn;
        this.mqttConn = new MqttConn({ conn });
        this.handlers = handlers;
    }
    async send(packet) {
        logger.debug("Sending", PacketNameByType[packet.type]);
        logger.debug(JSON.stringify(packet, null, 2));
        await this.mqttConn.send(packet);
    }
    connect(clientId, clean) {
        logger.debug("Connecting", clientId);
        const existingSession = Context.clientList.get(clientId);
        if (existingSession) {
            existingSession.close(false);
        }
        this.store = this.persistence.registerClient(clientId, this.doPublish.bind(this), clean);
        this.connected = true;
        this.broadcast("$SYS/connect/clients", clientId);
        logger.debug("Connected", clientId);
    }
    doPublish(packet) {
        const qos = packet.qos || 0;
        if (qos === 0) {
            packet.id = 0;
            this.send(packet);
            return;
        }
        if (this.store) {
            packet.id = this.store.nextId();
            this.store.pendingOutgoing.set(packet.id, packet);
            this.send(packet);
        }
    }
    clean(clientId) {
        this.persistence.deregisterClient(clientId);
    }
    close(executewill = true) {
        if (this.connected) {
            logger.debug(`Closing ${this.store?.clientId} while mqttConn is ${this.mqttConn.isClosed ? "" : "not "}closed`);
            this.connected = false;
            if (typeof this.timer === "object") {
                this.timer.clear();
            }
            if (this.store) {
                this.broadcast("$SYS/disconnect/clients", this.store.clientId);
            }
            if (executewill) {
                this.handleWill();
            }
        }
        if (!this.mqttConn.isClosed) {
            this.mqttConn.close();
        }
    }
    handleWill() {
        if (this.will) {
            if (!this.will.topic.startsWith(SysPrefix) &&
                this.handlers.isAuthorizedToPublish &&
                this.handlers.isAuthorizedToPublish(this, this.will.topic)) {
                this.persistence.publish(this.will.topic, this.will);
            }
        }
    }
    broadcast(topic, payload, retain = false) {
        const packet = {
            type: PacketType.publish,
            topic,
            retain,
            payload: utf8Encoder.encode(payload),
        };
        if (packet.retain === true) {
            this.persistence.retained.set(packet.topic, packet);
        }
        this.persistence.publish(packet.topic, packet);
    }
}
