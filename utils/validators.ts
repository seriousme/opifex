/**
 * Checks for too many topic levels to reduce the risk of Denial of Service
 *
 * @param value - The string to validate.
 * @returns `true` if the string contains more / signs than allowed`.
 */
export function invalidmaxTopicLevels(
  value: string,
  maxTopicLevels: number,
): boolean {
  let slashCount = 0;
  for (const char of value) {
    if (char === "/") {
      slashCount++;
      if (slashCount > maxTopicLevels) return true;
    }
  }
  return false;
}

/**
 * Checks for invalid characters in an MQTT topic name.
 * It cannot contain wildcards (+, #)
 *
 * @param value - The topic name to validate.
 * @returns `true` if the topic is invalid, otherwise `false`.
 */
export function invalidTopic(value: string): boolean {
  return hasWildcards(value);
}

/**
 * Checks for MQTT wildcards in a string.
 *
 * @param value - The topic name to validate.
 * @returns `true` if the topic is invalid, otherwise `false`.
 */
export function hasWildcards(value: string): boolean {
  // Native .includes() is significantly faster than regular expressions for basic character checks
  return value.includes("+") || value.includes("#");
}

/**
 * Checks for invalid characters and malformed wildcards in an MQTT topic filter.
 *
 * Wildcard rules according to the MQTT specification:
 * - '+' must occupy an entire level (e.g., 'a/+/b' is valid, 'a+/b' is invalid)
 * - '#' must only appear at the very end of the string (e.g., 'a/#' is valid, 'a/#/b' is invalid)
 *
 * @param value - The topic filter to validate.
 * @returns `true` if the topic filter is invalid, otherwise `false`.
 */
export function invalidTopicFilter(value: string): boolean {
  // Rule 1: A '#' wildcard must NEVER be followed by any other character
  if (/#./.test(value)) {
    return true;
  }

  // Rule 2: A '+' wildcard must be isolated by slashes (or string boundaries).
  // Modern lookbehind (?<=) and lookahead (?=) make this highly readable.
  const malformedPlus = /(?<=[^\/])\+|\+(?=[^\/])/.test(value);
  if (malformedPlus) {
    return true;
  }

  return false;
}
