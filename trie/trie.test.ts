import assert from "node:assert/strict";
import { test } from "node:test";
import { Trie } from "./trie.ts";

type Data = Array<[string, number]>;
type Matches = Array<[string, number[]]>;
type MatchResult = Array<number | object>;

const includesAll = (arr: MatchResult, values: MatchResult) =>
  values.every((v) => arr.includes(v));

function doTest(data: Data, matches: Matches) {
  const root = new Trie<number>();
  for (const [key, value] of data) {
    root.add(key, value);
  }

  for (const [match, result] of matches) {
    assert.ok(includesAll(root.match(match), result), `${match} found`);
  }
}

test("new should create new Trie object", () => {
  const root = new Trie<number>();
  assert.deepStrictEqual(typeof root, "object");
  assert.deepStrictEqual(root instanceof Trie, true);
});

test("match() should find the correct nodes in the trie structure", () => {
  const data: Data = [
    ["foo", 1],
    ["foo/bar", 2],
    ["foo/bar/buzz", 3],
    ["foo/bar/buzz", 4],
  ];

  const matches: Matches = [
    ["", []],
    ["foo", [1]],
    ["foo/bar", [2]],
    ["foo/bar/buzz", [3, 4]],
    ["foo/bar/buzz/", []],
    ["/foo/bar/buzz/", []],
    ["$SYS/foo/bar/buzz/", []],
  ];

  doTest(data, matches);
});

test("wildCardOne works", () => {
  const data: Data = [
    ["foo", 1],
    ["foo/+/buzz", 2],
    ["foo/bar/buzz", 3],
    ["foo/bar/buzz", 4],
    ["+/+", 5],
    ["/+", 6],
    ["+", 7],
  ];

  const matches: Matches = [
    ["", [7]],
    ["foo", [1, 7]],
    ["foo/bar", [5]],
    ["foo/bar/buzz", [2, 3, 4]],
    ["/foo/bar/buzz", []],
    ["/finance", [5, 6]],
  ];

  doTest(data, matches);
});

test("wildCardSubtree works", () => {
  const data: Data = [
    ["foo", 1],
    ["foo/#", 2],
    ["foo/bar/buzz", 3],
    ["foo/bar/#", 4],
    ["#", 5],
    ["/#", 6],
  ];

  const matches: Matches = [
    ["", [5]],
    ["foo", [1, 5]],
    ["foo/bar", [2, 5]],
    ["foo/bar/buzz", [2, 3, 4, 5]],
    ["/foo/bar/buzz", [5, 6]],
    ["/finance", [5, 6]],
  ];

  doTest(data, matches);
});

test("Overlapping wildcards work", () => {
  const data: Data = [
    ["foo/+/buzz", 1],
    ["+/bar/buzz", 2],
  ];

  const matches: Matches = [["foo/bar/buzz", [1, 2]]];

  doTest(data, matches);
});

test("Reserved prefixes are excluded from toplevel wildcards", () => {
  const data: Data = [
    ["+/bar/buzz", 1],
    ["#", 2],
    ["$SYS/#", 3],
    ["$SYS/+/bar/buzz", 4],
  ];

  const matches: Matches = [
    ["foo/bar/buzz", [1, 2]],
    ["$SYS/foo/bar/buzz", [3, 4]],
  ];

  doTest(data, matches);
});

test("Removal works", () => {
  const root = new Trie<number>();
  root.add("foo/bar", 1);
  root.add("foo/bar", 2);
  assert.ok(includesAll(root.match("foo/bar"), [1, 2]), "two items found");
  root.remove("foo/bar", 2);
  assert.ok(includesAll(root.match("foo/bar"), [1]), "one item found");
  root.remove("foo/bar", 1);
  assert.deepStrictEqual(root.match("foo/bar").length, 0, "no items left");
});

test("Removal of object values works", () => {
  type ComplexValue = { a: number; b: number; c: number };

  const root = new Trie<ComplexValue>(true);
  const c1: ComplexValue = { a: 1, b: 2, c: 3 };
  const c2: ComplexValue = { a: 2, b: 4, c: 6 };
  root.add("foo/bar", c1);
  root.add("foo/bar", c2);
  assert.ok(includesAll(root.match("foo/bar"), [c1, c2]), "two items found");
  root.remove("foo/bar", c2);
  assert.ok(includesAll(root.match("foo/bar"), [c1]), "one item found");
  root.remove("foo/bar", { a: 1, b: 2, c: 3 });
  assert.ok(includesAll(root.match("foo/bar"), []), "empty array");
  assert.deepStrictEqual(root.match("foo/bar").length, 0, "matches left");
});
