import { describe, expect, it } from "vitest";
import { countMatches, findAllRanges, findRanges, mergeRanges } from "../src/lib/highlight";

describe("findRanges", () => {
  it("returns the first occurrence of each term, case/diacritic-insensitive", () => {
    expect(findRanges("Entropy and entropy", ["entropy"])).toEqual([[0, 7]]);
    expect(findRanges("café culture", ["cafe"])).toEqual([[0, 4]]);
  });

  it("preserves original-string offsets (normalize never changes length)", () => {
    const text = "The arrow of time";
    const [[start, end]] = findRanges(text, ["arrow"]);
    expect(text.slice(start, end)).toBe("arrow");
  });

  it("ignores terms that do not occur", () => {
    expect(findRanges("black holes", ["boson"])).toEqual([]);
  });
});

describe("findAllRanges", () => {
  it("returns every occurrence, not just the first", () => {
    expect(findAllRanges("entropy entropy entropy", ["entropy"])).toEqual([
      [0, 7],
      [8, 15],
      [16, 23]
    ]);
  });

  it("does not overlap a term with itself", () => {
    // "aa" in "aaa" should match once starting at 0, then resume past it.
    expect(findAllRanges("aaa", ["aa"])).toEqual([[0, 2]]);
  });
});

describe("countMatches", () => {
  it("counts total occurrences across all terms", () => {
    expect(countMatches("time and time again, entropy", ["time", "entropy"])).toBe(3);
  });

  it("is zero for an empty term list", () => {
    expect(countMatches("anything", [])).toBe(0);
  });
});

describe("mergeRanges", () => {
  it("merges overlapping and adjacent ranges", () => {
    expect(
      mergeRanges([
        [0, 5],
        [3, 8],
        [10, 12]
      ])
    ).toEqual([
      [0, 8],
      [10, 12]
    ]);
  });

  it("sorts before merging", () => {
    expect(
      mergeRanges([
        [10, 12],
        [0, 5]
      ])
    ).toEqual([
      [0, 5],
      [10, 12]
    ]);
  });
});
