[![Nodejs CI](https://github.com/seriousme/opifex/actions/workflows/nodejs-ci.yml/badge.svg)](https://github.com/seriousme/opifex/actions/workflows/nodejs-ci.yml)
[![Deno CI](https://github.com/seriousme/opifex/actions/workflows/deno-ci.yml/badge.svg)](https://github.com/seriousme/opifex/actions/workflows/deno-ci.yml)
[![CodeQL](https://github.com/seriousme/opifex/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/seriousme/opifex/actions/workflows/codeql-analysis.yml)

# Opifex

Opifex aims to provide a MQTT server and MQTT client in Typescript to be used
with [NodeJS](https://nodejs.org), [Deno](https://deno.land) or
[Bun](https://bun.sh) It has _no_ third party dependencies, it only relies on
built in modules.

# Compatibility

The following MQTT versions are supported:

|                | MQTT 3.1 (v3) | MQTT 3.11 (v4) | MQTT 5.0 (v5) |
| -------------- | ------------- | -------------- | ------------- |
| Packet/encoder | ✅            | ✅             | ✅            |
| Client         | ✅            | ✅             | ✅ partially  |
| Server         | ❌            | ✅             | ❌            |

Client and server currently only have memory based persistence, but one can
provide its own persistence. (see [#Architecture] )

## Usage

The most easy way to use this project is to just use the demo server
(demoServer) and/or the demo client (mqtt).

- [NodeJS/Bun](node/README.md)
- [Deno](deno/README.md)

If you want to change the behaviour of the server and/or the client beyond what
can be done with CLI options then the next step is to clone the demo server
and/or the client scripts and modify them to your liking.

If you want to port the platform independent client and server libs to other
types of transport (e.g. Unix sockets or websocketstream) then its recommended
to clone and modify the platform specific code in `/node` or `/deno` as well.

If you want to port the platform independent client and server libs to another
platform then the platform specific code in `/node` or `/deno` might serve as
inspiration.

Bun (as of version 1.2) and Deno are both capable of running the NodeJS version,
but for historic reasons `/deno` still exists.

## Example

A simple server example using Deno.

```typescript
import { MqttServer } from "./server/mod.ts";

const listener = Deno.listen();
const mqttServer = new MqttServer(mqttOptions);
for await (const conn of this.listener) {
  mqttServer.serve(conn);
}
```

A more elaborate example including client and server can be found in the
[examples](/examples/) folder.

## Architecture

1. The basis of Opifex is the MQTT packet module
   ([mqttPacket/mod.ts](mqttPacket/mod.ts)) which contains al the logic to
   encode and decode packets.

2. On top of mqttPacket sits the MQTT connection module
   ([mqttConn/mod.ts](mqttConn/mod.ts)) module that reads packets from a
   Readable stream and writes them to Writable stream. It will take care of
   incomplete and/or malformed packets. mqttConn provides an async iterable that
   can be awaited for new packets.

3. On top of mqttConn live the MQTT server ([server/mod.ts](server/mod.ts)) and
   MQTT client ([client/mod.ts](client/mod.ts)) that take care of the MQTT
   protocol handling like requiring an authentication to be successfull before
   another type of packet will be accepted. Both follow a similar model of
   implementation where for each packet that is received a handler is invoked
   which then triggers the next step. Server and client are totally independ of
   the technical implementation of the connection and only need a socketConn
   ([socket](socket)) to be able to work.

4. As the server needs to be able to serve multiple clients at the same time, it
   maintains a context ([server/context.ts](server/context.ts)) per client to
   keep track of its state and associated timers.

5. Persistence of data is handled by a pluggable persistence module
   ([persistence](persistence)) which currently only offers memory persistence
   ([persistence/memory](persistence/memory)) but can be extended with database
   backed persistence supported by third party modules.

6. The demo server listens to a platform specific socket and runs the `serve()`
   method from the server module on the platform independent streams of every
   connection.

7. The demo client opens a platform specific socket and passes the resulting
   platform independent streams to the client module.

## Exports

| Export                        | Description                                             |
| ----------------------------- | ------------------------------------------------------- |
| @seriousme/opifex/tcpClient   | Exports a MQTT over TCP client                          |
| @seriousme/opifex/tcpServer   | Exports a MQTT over TCP server                          |
| @seriousme/opifex/server      | Exports a transport agnostic MQTT server                |
| @seriousme/opifex/client      | Exports a transport agnostic MQTT client                |
| @seriousme/opifex/persistence | Exports an Typescript interface for storage persistence |
| @seriousme/opifex/mqttConn    | Exports MQTT connection handling                        |
| @seriousme/opifex/mqttPacket  | Exports MQTT packet handling                            |
| @seriousme/opifex/utils       | Exports various utilities                               |

## Naming

Some MQTT servers have names like:

- [Mosquitto](https://en.wikipedia.org/wiki/Mosquito)
- [Mosca](https://it.wikipedia.org/wiki/Musca_domestica)
- [Aedes](https://en.wikipedia.org/wiki/Aedes)

So to stay with the theme: [Opifex](https://en.wikipedia.org/wiki/Opifex_(fly))

# License

Licensed under [MIT](LICENSE.txt)
