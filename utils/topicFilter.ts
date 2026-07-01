/**
 * Converts an MQTT topic filter into a regular expression according to the MQTT specification.
 *
 * This utility escapes standard regex characters to prevent injection or unexpected behavior,
 * and then converts the native MQTT wildcards into their regex equivalents:
 * - `+` (single-level wildcard) becomes `[^/]+` (matches one or more characters except a forward slash)
 * - `#` (multi-level wildcard) becomes an optional matching group `(?:/.*)?` to correctly handle parent levels.
 *
 * @param topicFilter - The MQTT topic filter string to convert (e.g., "home/+/temperature" or "clients/#").
 * @returns A `RegExp` object configured to match topics corresponding to the filter.
 *
 * @example
 * ```typescript
 * const regex = topicFilterToRegExp("home/+/temperature");
 * regex.test("home/livingroom/temperature"); // true
 * regex.test("home/kitchen/lights");        // false
 * ```
 */
export function topicFilterToRegExp(topicFilter: string): RegExp {
  // RegExp.escape (ES2024+) safely escapes special characters, forcing punctuation into hex formats (\xHH)
  const escaped = RegExp.escape(topicFilter);

  const regexStr = escaped
    .replace(/\\\+/g, "[^/]+") // Replace '+' wildcard globally
    .replace(/(?:\\\/)?\\x23/g, "(?:/.*)?"); // Replace '#' and its optional preceding slash (\/) globally

  return new RegExp(`^${regexStr}$`);
}
