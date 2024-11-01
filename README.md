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

## Naming

Some MQTT servers have names like:

- [Mosquitto](https://en.wikipedia.org/wiki/Mosquito)
- [Mosca](https://it.wikipedia.org/wiki/Musca_domestica)
- [Aedes](https://en.wikipedia.org/wiki/Aedes)

So to stay with the theme: [Opifex](https://en.wikipedia.org/wiki/Opifex_(fly))

# License

Licensed under [MIT](LICENSE.txt)
