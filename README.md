# Opifex

Opifex aims to provide a MQTT server and MQTT client in Typescript to be used with
[Deno](https://deno.land) It has _no_ third party dependencies, it only relies
on built in Deno modules.

Its a work in progress, only does MQTT 3.1.1 and currently only has memory based
persistence.

## Playing around

Make sure you have [Deno](https://deno.land) installed.

Then use:

```bash
deno run https://raw.githubusercontent.com/seriousme/opifex/master/server/demoServer.ts
```

On the first invocation Deno will download all dependencies. It will then pop
the question:

```
Deno requests net access to ":::1883". Run again with --allow-net to bypass this prompt.
   Allow? [y/n (y = yes allow, n = no deny)]
```

After you select `yes` you should have a working MQTT server.

## Naming

Some MQTT servers have names like:

- [Mosquitto](https://en.wikipedia.org/wiki/Mosquito)
- [Mosca](https://it.wikipedia.org/wiki/Musca_domestica)
- [Aedes](https://en.wikipedia.org/wiki/Aedes)

So to stay with the theme: [Opifex](https://en.wikipedia.org/wiki/Opifex_(fly))

# License

Licensed under [MIT](LICENSE.txt)
