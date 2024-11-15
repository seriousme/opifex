// deno-lint-ignore no-control-regex
const invalidUTF8regEx = new RegExp(/\x00|\uFFFD/);
// deno-lint-ignore no-control-regex
const invalidTopicRegEx = new RegExp(/^$|\+|#|\x00|\uFFFD/);
// deno-lint-ignore no-control-regex
const invalidTopicFilterRegEx = new RegExp(/^$|#.|[^\/]\+|\+[^\/]|\x00|\uFFFD/);
export function invalidUTF8(value) {
    return invalidUTF8regEx.test(value);
}
export function invalidTopic(value) {
    return invalidTopicRegEx.test(value);
}
export function invalidTopicFilter(value) {
    return invalidTopicFilterRegEx.test(value);
}
