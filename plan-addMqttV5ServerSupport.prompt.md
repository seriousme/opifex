## Plan: Add MQTT v5 server support

TL;DR: Enable the server to accept MQTT 5 CONNECT packets and respond with valid v5 CONNACK/SUBACK semantics, while preserving existing persistence/session behavior and reusing the already-complete packet codec support.

Steps
1. Update server connect handling
   - Modify `server/handlers/handleConnect.ts` so `validateConnect()` accepts protocolLevel 5 in addition to 4.
   - Add a v5 mapping from `AuthenticationResult` to MQTT v5 `ReasonCode` and return that in v5 CONNACK.
   - When v5 connect is successful, keep the existing `sessionPresent` behavior but send `reasonCode: ReasonCode.success` instead of `returnCode`.
   - Preserve will properties from `packet.will?.properties` in `ctx.will` for v5 clients.
   - Ensure `ctx.mqttConn.codecOpts.protocolLevel` is updated to `packet.protocolLevel` after connect.
   - Treat protocol level as per-connection, not per-session: allow the same `clientId` to reconnect as v4 or v5 and resume the same session if `clean=false`.
   - On cross-version reconnects, honor the reconnecting connection’s protocol for all outgoing packet encoding and response shapes.

2. Update server subscribe handling for v5
   - Change `server/handlers/handleSubscribe.ts` to send a v5-style SUBACK when `ctx.protocolLevel === 5`.
   - Construct `reasonCodes` instead of `returnCodes` and include an empty `properties` object if needed.
   - Keep the same authorization logic; do not change subscribe semantics or persistence behavior.

3. Add or update targeted tests
   - Extend `server/handlers/handleConnect.version.test.ts` with a positive MQTT 5 connection acceptance test and verify CONNACK reasonCode semantics.
   - Add v5 test coverage for `server/handlers/handleSubscribe.test.ts` to verify SUBACK uses v5 shape and can be encoded/decoded.
   - Optionally add a small v5 publish/ack round-trip test in `server/handlers/handlePublish.test.ts` if server behavior is changed.

4. Validate current packet/codec compatibility and server runtime flow
   - The packet library already supports v5 encoding/decoding for CONNECT, CONNACK, SUBSCRIBE, SUBACK, PUBLISH, and ACK packets.
   - No `mqttConn` core changes appear required beyond ensuring `codecOpts.protocolLevel` tracks the negotiated version.

5. Extend MQTT v5 broker semantics beyond packet shape
   - Add server-side handling for `CONNECT.properties` relevant to broker behavior:
     - `sessionExpiryInterval` should control how long a session is retained when `clean` is false.
     - `receiveMaximum`, `maximumPacketSize`, and other network constraints may need to be stored and enforced.
   - Support `messageExpiryInterval` for incoming PUBLISH messages:
     - store expiry metadata in persistence when a publish contains the property
     - skip delivering expired retained or queued messages
     - avoid persisting expired messages for offline clients
   - Preserve `WILL.properties` and apply them when the will is published on disconnect.
   - Handle v5 disconnect semantics by optionally emitting reason codes and properties via `DISCONNECT`.
   - Implement basic v5 SUBSCRIBE/SUBACK properties if broker behavior requires it, such as `subscriptionIdentifiers` or user property round-trip.
   - Support mixed v4/v5 clients and version-migrating reconnects:
     - allow the same `clientId` to reconnect as either v4 or v5
     - resume session state across versions when `clean=false`
     - use the new connection’s protocol level for outgoing packet encoding
     - treat v5-only metadata as optional for v4 reconnects and avoid breaking downgrade scenarios

Relevant files
- `/workspaces/opifex/server/handlers/handleConnect.ts` — accept v5, map auth result to v5 reason codes, emit correct v5 CONNACK shape, and honor `CONNECT.properties`.
- `/workspaces/opifex/server/handlers/handleConnect.version.test.ts` — validate MQTT 5 connect acceptance and rejection behavior.
- `/workspaces/opifex/server/handlers/handleSubscribe.ts` — send v5 SUBACK shape when protocolLevel is 5.
- `/workspaces/opifex/server/handlers/handleSubscribe.test.ts` — add v5 SUBACK coverage.
- `/workspaces/opifex/server/context.ts` — preserve v5 will properties when storing the will and track session expiry requirements.
- `/workspaces/opifex/server/handlers/handlePublish.ts` — optionally verify v5 ack semantics and will property preservation.
- `/workspaces/opifex/persistence/mod.ts` and persistence store implementations — add support for message expiry metadata and session expiry semantics.
- `/workspaces/opifex/server/handlers/handleDisconnect.ts` — support v5 disconnect reason/properties if desired.

Verification
1. Run `deno test server/handlers/handleConnect.version.test.ts` to confirm MQTT 5 acceptance and rejection.
2. Run `deno test server/handlers/handleSubscribe.test.ts` to confirm v5 SUBACK behavior.
3. Run `deno test server/handlers/handlePublish.test.ts` if adding publish ack tests.
4. Add targeted tests for message expiry, session expiry, and will property preservation in persistence.
5. Run the broader server test suite or `deno test server/handlers` after changes to catch regressions.

Decisions
- Scope is minimal MQTT v5 server support for CONNECT/SUBSCRIBE/PUBACK/PUBREC/PUBREL/PUBCOMP semantics and correct packet shape handling, with a second phase adding broker-specific v5 semantics.
- This plan does not add advanced MQTT v5 features such as shared subscriptions, topic aliases, or rich property negotiation beyond basic pass-through where packet shapes already support them.
- Authentication remains on the existing server handler API; v5 rejections are mapped to MQTT v5 reason codes rather than introducing a new auth interface.
- Message expiry and session expiry will require persistence-aware changes, so they should be added as an explicit extension rather than part of the initial packet-shape pass.

Further considerations
1. If you want full MQTT 5 property support, a second pass should add explicit handling of `CONNECT.properties`, `WILL.properties`, `SUBSCRIBE.properties`, and `DISCONNECT.properties`.
2. If MQTT v5 client support is later added, reuse the same packet-shape conversion logic from server tests to maintain symmetric behavior.
3. For MQTT v5 broker semantics, define persistence metadata fields for expiry and session retention before changing server publish/connect logic.
