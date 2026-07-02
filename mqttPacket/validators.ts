import type { Topic, TopicFilter } from "./types.ts";

// to reduce the risk of Denial of Service
export const DEFAULT_MAX_TOPIC_SEGMENTS = 10;
/**
 * Checks for invalid UTF-8 characters or null bytes.
 *
 * @param value - The string to validate.
 * @returns `true` if the string contains more / signs than allowed`.
 */
export function invalidMaxTopicSegments(
  value: string,
  maxTopicSegments: number,
): boolean {
  let slashCount = 0;
  for (const char of value) {
    if (char === "/") {
      slashCount++;
      if (slashCount > maxTopicSegments) return true;
    }
  }
  return false;
}

/**
 * Checks for invalid UTF-8 characters or null bytes.
 *
 * @param value - The string to validate.
 * @returns `true` if the string contains invalid UTF-8 sequences or a null byte, otherwise `false`.
 */
export function invalidUTF8(value: string): boolean {
  return value.includes("\x00") || !value.isWellFormed();
}

/**
 * Checks for invalid characters in an MQTT topic name.
 * An MQTT topic name cannot be empty, cannot contain wildcards (+, #), and must be valid UTF-8.
 *
 * @param value - The topic name to validate.
 * @returns `true` if the topic is invalid, otherwise `false`.
 */
export function invalidTopic(value: Topic): boolean {
  if (value === "" || invalidUTF8(value)) {
    return true;
  }
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
export function invalidTopicFilter(value: TopicFilter): boolean {
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
