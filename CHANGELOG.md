# Changelog

## [Unreleased]

### Changed

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
