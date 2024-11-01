# Running Opifex server/client on NodeJS

These instructions specifify how to run [Opifex](README.md) on NodeJS. To run
Opifex on Deno see the [instructions](../deno/README.md)

## Playing around

Make sure you have NodeJS with a version > 22.6.0 installed.

### Server

```bash
npx -p @seriousme/opifex demoserver --help
```

### Client

```bash
npx @seriousme/opifex mqtt --help
```

## Local deployment

You can use:

```bash
npm install @seriousme/opifex
```

to install Opifex.

Or clone the repository, e.g. using:

```bash
git clone https://github.com/seriousme/opifex.git
```

and then use:

```bash
./bin/demoServer.ts --help
```

```bash
./bin/mqtt.ts --help
```
