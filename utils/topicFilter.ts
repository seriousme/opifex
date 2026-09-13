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

/**
 * Parses a Topic filter for a "shared subscription" into the share name and the regular Topic Filter
 *
 * @param topicFilter - The MQTT topic filter string to parse (e.g. "$share/sharename/rest/of/topic/filter")).
 * @returns an object that contains the regular topicFilter and he share name (if present)
 */
export function parseTopicFilter(topicFilter: string): {
  topicFilter: string;
  shareName: string;
} {
  if (topicFilter.startsWith("$share/")) {
    const nextSlashIndex = topicFilter.indexOf("/", 7);
    if (nextSlashIndex !== -1) {
      return {
        topicFilter: topicFilter.slice(nextSlashIndex + 1),
        shareName: topicFilter.slice(7, nextSlashIndex),
      };
    }
  }
  return { topicFilter, shareName: "" };
}

/** the inverse of parseTopicFilter */
export function joinTopicFilter(
  topicFilter: string,
  shareName: string,
): string {
  if (shareName !== "") {
    return `$share/${shareName}/${topicFilter}`;
  }
  return topicFilter;
}

/**
 * check if 2 topicFilters overlap
 *
 * @param filterA - the first filter.
 * @param filterB - the second filter.
 * @returns true if the filters partially overlap
 */
export function topicFiltersOverlap(filterA: string, filterB: string): boolean {
  if (filterA === filterB || filterA === "#" || filterB === "#") return true;

  const segsA = filterA.split("/");
  const segsB = filterB.split("/");
  const minLen = Math.min(segsA.length, segsB.length);

  for (let i = 0; i < minLen; i++) {
    const a = segsA[i];
    const b = segsB[i];

    if (a === "#" || b === "#") return true;
    if (a === "+" || b === "+") continue;
    if (a !== b) return false;
  }

  // Exact match on lengths
  if (segsA.length === segsB.length) return true;

  // If one filter is longer, it overlaps only if its next segment is '#'
  const longer = segsA.length > segsB.length ? segsA : segsB;
  return longer[minLen] === "#";
}
