import { Trie } from "./trie.ts";
import { assertArrayIncludes, assertEquals } from "../dev_utils/mod.ts";

type Data = Array<[string, number]>;
type Matches = Array<[string, number[]]>;

function doTest(data: Data, matches: Matches) {
  const root = new Trie<number>();
  for (const [key, value] of data) {
    root.add(key, value);
  }

  for (const [match, result] of matches) {
    assertArrayIncludes(root.match(match), result, `Matching '${match}'`);
  }
}

Deno.test("new should create new Trie object", () => {
  const root = new Trie<number>();
  assertEquals(typeof root, "object");
  assertEquals(root instanceof Trie, true);
});

Deno.test("match() should find the correct nodes in the trie structure", () => {
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

Deno.test("wildCardOne works", () => {
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

Deno.test("wildCardSubtree works", () => {
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

Deno.test("Overlapping wildcards work", () => {
  const data: Data = [
    ["foo/+/buzz", 1],
    ["+/bar/buzz", 2],
  ];

  const matches: Matches = [["foo/bar/buzz", [1, 2]]];

  doTest(data, matches);
});

Deno.test("Reserved prefixes are excluded from toplevel wildcards", () => {
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

Deno.test("Removal works", () => {
  const root = new Trie<number>();
  root.add("foo/bar", 1);
  root.add("foo/bar", 2);
  assertArrayIncludes(root.match("foo/bar"), [1, 2]);
  root.remove("foo/bar", 2);
  assertArrayIncludes(root.match("foo/bar"), [1]);
  root.remove("foo/bar", 1);
  assertEquals(root.match("foo/bar").length, 0, "matches left");
});

Deno.test("Removal of object values works", () => {
  type ComplexValue = { a: number; b: number; c: number };

  const root = new Trie<ComplexValue>(true);
  const c1: ComplexValue = { a: 1, b: 2, c: 3 };
  const c2: ComplexValue = { a: 2, b: 4, c: 6 };
  root.add("foo/bar", c1);
  root.add("foo/bar", c2);
  assertArrayIncludes(root.match("foo/bar"), [c1, c2]);
  root.remove("foo/bar", c2);
  assertArrayIncludes(root.match("foo/bar"), [c1]);
  root.remove("foo/bar", { a: 1, b: 2, c: 3 });
  assertArrayIncludes(root.match("foo/bar"), []);
  assertEquals(root.match("foo/bar").length, 0, "matches left");
});
