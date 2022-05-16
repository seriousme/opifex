import { QoS, Topic, TopicFilter } from "./types.ts";

const invalidUTF8regEx = new RegExp(/\x00|\uFFFD/);
const invalidTopicRegEx = new RegExp(/^$|\+|#|\x00|\uFFFD/);
const invalidTopicFilterRegEx = new RegExp(/^$|#.|[^\/]\+|\+[^\/]|\x00|\uFFFD/);

export function invalidUTF8(value: string): boolean {
  return invalidUTF8regEx.test(value);
}

export function invalidTopic(value: Topic): boolean {
  return invalidTopicRegEx.test(value);
}

export function invalidTopicFilter(value: TopicFilter): boolean {
  return invalidTopicFilterRegEx.test(value);
}
