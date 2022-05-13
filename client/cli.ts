import { Client } from "./client.ts";

/** MQTT client */
const url = Deno.args[0];
const logger = console.log;
const client = new Client();
try {
  const connack = await client.connect({ url });
  logger("connected !", connack);
  await client.disconnect();
  logger("Disconnected !");
} catch (err) {
  logger(err.message);
}
