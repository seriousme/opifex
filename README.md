[![Deno CI](https://github.com/seriousme/opifex/actions/workflows/deno-ci.yml/badge.svg)](https://github.com/seriousme/opifex/actions/workflows/deno-ci.yml)
[![CodeQL](https://github.com/seriousme/opifex/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/seriousme/opifex/actions/workflows/codeql-analysis.yml)

# Opifex

Opifex aims to provide a MQTT server and MQTT client in Typescript to be used
with [Deno](https://deno.land) or [NodeJS](https://nodejs.org) It has _no_ third
party dependencies, it only relies on built in modules.

Its a work in progress, only does MQTT 3.1.1 and currently only has memory based
persistence.

There are separate usage instructions for:

- [Deno](deno/README.md)
- [NodeJS](node/README.md)

The client and server libs should also work on Bun as they are engine
independent, but the demo server and client currently do not work on Bun because
of some socket incompatibilities between Bun and the rest.

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

## Naming

Some MQTT servers have names like:

- [Mosquitto](https://en.wikipedia.org/wiki/Mosquito)
- [Mosca](https://it.wikipedia.org/wiki/Musca_domestica)
- [Aedes](https://en.wikipedia.org/wiki/Aedes)

So to stay with the theme: [Opifex](https://en.wikipedia.org/wiki/Opifex_(fly))

# License

Licensed under [MIT](LICENSE.txt)
