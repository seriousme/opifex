# Examples

This folder contains examples for [Opifex](README.md). It serves as a practical
reference for setting up client/server communication, transport handling,
authentication, and persistence.

## Index

- `mqtt.test.ts` — basic MQTT publish/subscribe flow over TCP with in-memory
  persistence.
- `mqtts.test.ts` — TLS-based MQTT example using SQLite persistence.
- `authHandler.test.ts` — MQTT v5 authentication example with a custom
  `processAuth` handler.
- `webSocket.test.ts` — WebSocket-based client/server flow for Deno.
- `webSocketServer.ts` — simple WebSocket serving example for browser-based MQTT
  usage.
- `public/` — static assets used by the browser-facing WebSocket demo.
