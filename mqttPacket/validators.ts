import type { Topic, TopicFilter } from "./types.ts";

// deno-lint-ignore no-control-regex
const invalidUTF8regEx = new RegExp(/\x00|\uFFFD/);
// deno-lint-ignore no-control-regex
const invalidTopicRegEx = new RegExp(/^$|\+|#|\x00|\uFFFD/);
// deno-lint-ignore no-control-regex
const invalidTopicFilterRegEx = new RegExp(/^$|#.|[^\/]\+|\+[^\/]|\x00|\uFFFD/);

/**
 * check for invalid UTF-8 characters
 * @param value string to test
 * @returns true if the string contains invalid UTF-8 characters
 */
export function invalidUTF8(value: string): boolean {
  return invalidUTF8regEx.test(value);
}

/**
 * check for invalid topic characters
 * @param value
 * @returns true if the topic is invalid
 */
export function invalidTopic(value: Topic): boolean {
  return invalidTopicRegEx.test(value);
}

/**
 * check for invalid topic filter characters
 * @param value topic filter to test
 * @returns true if the topic filter is invalid
 */
export function invalidTopicFilter(value: TopicFilter): boolean {
  return invalidTopicFilterRegEx.test(value);
}
