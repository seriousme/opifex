[![Nodejs CI](https://github.com/seriousme/opifex/actions/workflows/nodejs-ci.yml/badge.svg)](https://github.com/seriousme/opifex/actions/workflows/nodejs-ci.yml)
[![Deno CI](https://github.com/seriousme/opifex/actions/workflows/deno-ci.yml/badge.svg)](https://github.com/seriousme/opifex/actions/workflows/deno-ci.yml)
[![CodeQL](https://github.com/seriousme/opifex/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/seriousme/opifex/actions/workflows/codeql-analysis.yml)

# Opifex

Opifex aims to provide a MQTT server and MQTT client in Typescript to be used
with [NodeJS](https://nodejs.org), [Deno](https://deno.land) or
[Bun](https://bun.sh). It has _no_ third-party dependencies, it only relies on
built-in modules.

# Compatibility

The following MQTT versions are supported:

|                | MQTT 3.1 (v3) | MQTT 3.1.1 (v4) | MQTT 5.0 (v5)   |
| -------------- | ------------- | --------------- | --------------- |
| Packet/encoder | ✅            | ✅              | ✅              |
| Client         | ✅            | ✅              | ✅ <sup>1</sup> |
| Server         | ❌            | ✅              | ✅              |

<sup>1</sup> The client API fully supports MQTTv5, the CLI only supports a
subset

Version 5 support includes:

- Client Topic Alias ✅
- Server Topic Alias ✅
- Subscription Identifiers ✅
- Subscription options (NoLocal, RetainAsPublished, RetainHandling) ✅
- Message expiry interval ✅
- Will delay ✅
- Assigned Client Identifier ✅
- Client receive maximum ✅
- Server receive maximum ✅
- Shared Subscriptions ✅

# Transports

The following transports are currently supported:

- plain TCP ✅
- TLS ✅
- WebSockets ✅ <sup>2</sup>

<sup>2</sup> Deno + Browser only, NodeJS has no native websocket support.

You can add your own transports.

# Persistence

Opifex offers pluggable persistence, but one can provide its own persistence.
(see [Architecture](#architecture))

The following types are currently provided:

|        | Plugable | Memory | Sqlite |
| ------ | -------- | ------ | ------ |
| Client | ✅       | ✅     | ❌     |
| Server | ✅       | ✅     | ✅     |

## Usage

The easiest way to use this project is to just use the demo server (demoServer)
and/or the demo client (mqtt).

- [NodeJS/Bun](node/README.md)
- [Deno](deno/README.md)

If you want to change the behaviour of the server and/or the client beyond what
can be done with CLI options then the next step is to clone the demo server
and/or the client scripts and modify them to your liking.

If you want to port the platform independent client and server libs to other
types of transports (e.g. Unix sockets) then it's recommended to clone and
modify the platform specific code in `/node` , `/deno` or `/web` as well.

If you want to port the platform independent client and server libs to another
platform then the platform specific code in `/node` or `/deno` might serve as
inspiration.

Bun (as of version 1.2) and Deno are both capable of running the NodeJS version,
but for historic reasons `/deno` still exists.

## Example

A simple server example:

```typescript
import { TcpServer } from "@seriousme/opifex/tcpServer";

const server = new TcpServer({ port: 1883 }, {
  // just an example of how to configure the server
  configuration: {
    context: { maximumConnectPacketSize: 3000 },
  },
});
server.start();
console.log(
  `MQTT server running on port: ${server.port}, address: ${server.address}`,
);
```

More elaborate examples including client and server, TLS, Websockets and sqlite
can be found in the [examples](/examples/) folder.

## Architecture

1. The basis of Opifex is the MQTT packet module
   ([mqttPacket/mod.ts](mqttPacket/mod.ts)) which contains all the logic to
   encode and decode packets.

2. On top of mqttPacket sits the MQTT connection module
   ([mqttConn/mod.ts](mqttConn/mod.ts)) that reads packets from a Readable
   stream and writes them to Writable stream. It will take care of incomplete
   and/or malformed packets. mqttConn provides an async iterable that can be
   awaited for new packets.

3. On top of mqttConn live the MQTT server ([server/mod.ts](server/mod.ts)) and
   MQTT client ([client/mod.ts](client/mod.ts)) that take care of the MQTT
   protocol handling like requiring an authentication to be successful before
   another type of packet will be accepted. Both follow a similar model of
   implementation where for each packet that is received a handler is invoked
   which then triggers the next step. Server and client are totally independent
   of the technical implementation of the connection and only need a socketConn
   ([socket](socket)) to be able to work.

4. As the server needs to be able to serve multiple clients at the same time, it
   maintains a context ([server/context.ts](server/context.ts)) per client to
   keep track of its state and associated timers.

5. Persistence of data is handled by a pluggable persistence module
   ([persistence](persistence)) which currently offers single process
   persistence which you can replace by something more scalable (e.g. redis
   based clusters etc) This is backed by two storage providers:
   - ([persistence/memory](persistence/memory))
   - ([persistence/sqlite](persistence/sqlite)) (based on node:sqlite)

   but can be extended with other database backend persistence supported by
   third-party modules.

6. Server behavior can be customized by passing a
   ([ConfigurationInput object](server/config.ts)) via
   `MqttServerOptions.configuration`, see the example above.

7. The demo server listens to a platform specific socket and runs the `serve()`
   method from the server module on the platform independent streams of every
   connection.

8. The demo client opens a platform specific socket and passes the resulting
   platform independent streams to the client module.

## Exports

| Export                        | Description                                                  |
| ----------------------------- | ------------------------------------------------------------ |
| @seriousme/opifex/tcpClient   | Exports a MQTT over TCP/TLS client                           |
| @seriousme/opifex/tcpServer   | Exports a MQTT over TCP server                               |
| @seriousme/opifex/tlsServer   | Exports a MQTT over TLS server                               |
| @seriousme/opifex/wsClient    | Exports a MQTT over Websocket client (deno and browser only) |
| @seriousme/opifex/wsServer    | Exports a MQTT over Websocket server (deno only)             |
| @seriousme/opifex/server      | Exports a transport agnostic MQTT server                     |
| @seriousme/opifex/client      | Exports a transport agnostic MQTT client                     |
| @seriousme/opifex/persistence | Exports a Typescript interface for storage persistence       |
| @seriousme/opifex/mqttConn    | Exports MQTT connection handling                             |
| @seriousme/opifex/mqttPacket  | Exports MQTT packet handling                                 |
| @seriousme/opifex/utils       | Exports various utilities                                    |

## API docs

The latest API documentation can be found at:
https://jsr.io/@seriousme/opifex@latest/doc

## Naming

Some MQTT servers have names like:

- [Mosquitto](https://en.wikipedia.org/wiki/Mosquito)
- [Mosca](https://it.wikipedia.org/wiki/Musca_domestica)
- [Aedes](https://en.wikipedia.org/wiki/Aedes)

So to stay with the theme: [Opifex](https://en.wikipedia.org/wiki/Opifex_(fly))

# License

Licensed under [MIT](LICENSE.txt)
