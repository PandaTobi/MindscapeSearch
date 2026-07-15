import { beforeEach, describe, expect, it } from "vitest";
import {
  loadRecentSearches,
  pushRecentSearch,
  removeRecentSearch
} from "../src/lib/recent-searches";

beforeEach(() => localStorage.clear());

describe("recent searches", () => {
  it("stores most-recent-first", () => {
    pushRecentSearch("entropy", "keyword");
    pushRecentSearch("free will", "hybrid");
    expect(loadRecentSearches().map((entry) => entry.query)).toEqual(["free will", "entropy"]);
  });

  it("dedupes by (query, mode) and promotes the repeat to the front", () => {
    pushRecentSearch("entropy", "keyword");
    pushRecentSearch("many worlds", "keyword");
    pushRecentSearch("entropy", "keyword");
    const queries = loadRecentSearches().map((entry) => entry.query);
    expect(queries).toEqual(["entropy", "many worlds"]);
  });

  it("keeps the same query under different modes as distinct entries", () => {
    pushRecentSearch("entropy", "keyword");
    pushRecentSearch("entropy", "semantic");
    expect(loadRecentSearches()).toHaveLength(2);
  });

  it("caps history at five entries", () => {
    for (const q of ["a", "b", "c", "d", "e", "f"]) pushRecentSearch(q, "keyword");
    const queries = loadRecentSearches().map((entry) => entry.query);
    expect(queries).toEqual(["f", "e", "d", "c", "b"]);
  });

  it("ignores blank queries", () => {
    pushRecentSearch("   ", "keyword");
    expect(loadRecentSearches()).toHaveLength(0);
  });

  it("removes a specific (query, mode) entry", () => {
    pushRecentSearch("entropy", "keyword");
    pushRecentSearch("free will", "keyword");
    removeRecentSearch("entropy", "keyword");
    expect(loadRecentSearches().map((entry) => entry.query)).toEqual(["free will"]);
  });
});
