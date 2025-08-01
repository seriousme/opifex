# Changelog

## [Unreleased]

### Changed

- chore: update dependencies
  - @types/node ^22.13.1 → ^24.1.0

## [v1.9.4] 30-05-2025

### Changed

- fix: improved encoder buffer packing performance

## [v1.9.3] 23-04-2025

### Changed

- fix: added more JSdoc comments

## [v1.9.2] 22-04-2025

### Changed

- fix: fix Deno lint warnings on trie.ts

## [v1.9.1] 22-04-2025

### Changed

- fix: update deno.json

## [v1.9.0] 22-04-2025

### Changed

- feature: exported more types in /persistence
- fix: updated compatibility with Deno 2.2

## [v1.8.2] 09-02-2025

### Changed

- fix: added more JSdoc comments

## [v1.8.1] 09-02-2025

### Changed

- fix: fix export of mqttConn

## [v1.8.0] 08-02-2025

### Changed

- feature: added "exports" section to README.md and added /examples
- feature: export mqttCon and Persistence

## [v1.7.1] 08-02-2025

### Changed

- fix: fixed npm publication flow

## [v1.7.0] 08-02-2025

### Changed

- feature: added Typescript definitions (*.d.ts) and sourcemaps to /dist

## [v1.6.3] 31-01-2025

### Changed

- fix: improve memory persistence backend on reconnects

## [v1.6.2] 19-01-2025

### Changed

- fix: added more JSdoc comments

## [v1.6.1] 18-01-2025

### Changed

- fix: fixed Deno lint type errors

## [v1.6.0] 18-01-2025

### Changed

- added: export TcpClient and TcpServer for both NodeJS and Deno
- added: export mqttPacket and utils

## [v1.5.1] 16-01-2025

### Changed

- fixed issue with QoS=1

## [v1.5.0] 02-01-2025

### Changed

- added client certificate support to mqtts.ts

## [v1.4.0] 02-01-2025

### Changed

- added client certificate support (w0otness)

## [v1.3.0] 19-11-2024

### Changed

- update: added architectural description of Opifex to documentation
- update: added comments to platform specific code to explain boundary between
  platform agnostic and platform specific.
- update: set default clientId in client
- fix: improve handling of errors if client connect fails

## [v1.2.1] 01-11-2024

### Changed

- fix: unlock last BYOB request using respond(0)

## [v1.2.0] 01-11-2024

### Changed

- added support for NodeJS < 22.0.6 by adding transpiled Javascript in `/dist`

## [v1.1.0] 01-11-2024

### Changed

- added support for NodeJS >= 22.0.6 using --experimental-strip-types

## [v1.0.0] 09-10-2022

Initial version
