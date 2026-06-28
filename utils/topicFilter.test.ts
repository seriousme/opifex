import { test } from "node:test";
import assert from "node:assert";
import { topicFilterToRegExp } from "./topicFilter.ts";

test("should convert an exact topic filter without wildcards to a valid regex string", () => {
  const filter = "home/livingroom/temperature";
  const regex = topicFilterToRegExp(filter);

  assert.strictEqual(regex.test("home/livingroom/temperature"), true);
  assert.strictEqual(regex.test("home/kitchen/temperature"), false);
});

test("should handle the single-level wildcard (+) correctly", () => {
  const filter = "home/+/temperature";
  const regex = topicFilterToRegExp(filter);

  // Should match exactly one arbitrary level
  assert.strictEqual(regex.test("home/livingroom/temperature"), true);
  assert.strictEqual(regex.test("home/kitchen/temperature"), true);

  // Should not match if the level is missing or contains sub-levels
  assert.strictEqual(regex.test("home/temperature"), false);
  assert.strictEqual(regex.test("home/livingroom/closet/temperature"), false);
});

test("should handle the multi-level wildcard (#) correctly", () => {
  const filter = "home/#";
  const regex = topicFilterToRegExp(filter);

  // Should match anything that follows the prefix (including nothing)
  assert.strictEqual(regex.test("home"), true);
  assert.strictEqual(regex.test("home/livingroom"), true);
  assert.strictEqual(regex.test("home/livingroom/temperature"), true);
  assert.strictEqual(regex.test("home/kitchen/lights/status"), true);
  // should not match extensions
  assert.strictEqual(regex.test("homeo/livingroom"), false);
});

test("should escape special regex characters safely", () => {
  // Characters like '.' and '$' have special meanings in regex, but are literal in MQTT
  const filter = "device/v1.0$/+";
  const regex = topicFilterToRegExp(filter);

  // Should match the exact literal characters including the dot and dollar sign
  assert.strictEqual(regex.test("device/v1.0$/sensor"), true);

  // Should fail if the '.' is treated as a regex wildcard (matching any character)
  assert.strictEqual(regex.test("device/v1X0$/sensor"), false);
});

test("should combine both single-level (+) and multi-level (#) wildcards correctly", () => {
  const filter = "clients/+/status/#";
  const regex = topicFilterToRegExp(filter);

  assert.strictEqual(regex.test("clients/user123/status"), true);
  assert.strictEqual(regex.test("clients/user456/status/online"), true);
  assert.strictEqual(
    regex.test("clients/device789/status/connection/errors"),
    true,
  );

  assert.strictEqual(regex.test("clients/status/online"), false);
});
