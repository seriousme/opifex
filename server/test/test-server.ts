import { handlers } from "./test-handlers.ts";
import { MqttServer } from "../mod.ts";

export class testServer{
    private listener: Deno.Listener<Deno.Conn>;
    private mqttServer: MqttServer;
    constructor(port=0){
        this.listener= Deno.listen({port});
        this.mqttServer = new MqttServer({handlers});
    }

    async start(){
        for await(const conn of this.listener) {
            this.mqttServer.serve(conn);
        }
    }
    stop(){
        this.listener.close();
    }

    port(){
        if (this.listener.addr.transport === "tcp"){
            return this.listener.addr.port;
        }
    }
}
