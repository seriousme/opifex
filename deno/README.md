# Running Opifex server/client on Deno

These instructions specifify how to run [Opifex](README.md) on Deno. To run
Opifex on NodeJS see the [instructions](../node/README.md)

## Playing around

Make sure you have [Deno](https://deno.land) installed.

### Server

```bash
deno run https://deno.land/x/opifex/bin/demoServer.ts
```

On the first invocation Deno will download all dependencies. It will then pop
the question:

```
Deno requests net access to ":::1883". Run again with --allow-net to bypass this prompt.
   Allow? [y/n (y = yes allow, n = no deny)]
```

After you select `yes` you should have a working MQTT server.

### Client

```bash
deno run https://deno.land/x/opifex/bin/mqtt.ts
```

On the first invocation Deno will download all dependencies. It will then pop
the question:

```
Deno requests net access to "localhost:1883". Run again with --allow-net to bypass this prompt.
   Allow? [y/n (y = yes allow, n = no deny)]
```

## Local deployment

If you want to use Deno locally then clone the repository, e.g. using:

```bash
git clone https://github.com/seriousme/opifex.git
```

and then use:

```bash
deno run -A bin/demoServer.ts
```

```bash
deno run -A bin/mqtt.ts
```

## JSR.io

Opifex is also available on [JSR.io](https://jsr.io/@seriousme/opifex).

# Platform Native 
This folder also contains code to run the server using Deno
sockets instead of NodeJS sockets. You can modify the import statements in the
demoServer/client to use these instead.
