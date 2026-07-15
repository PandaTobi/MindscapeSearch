import { describe, expect, it } from "vitest";
import { defaultQueryState, readQueryState } from "../src/lib/url-state";

const read = (search: string) => readQueryState(new URLSearchParams(search));

describe("readQueryState", () => {
  it("defaults everything when the URL is empty", () => {
    expect(read("")).toEqual(defaultQueryState);
  });

  it("parses a full query state", () => {
    expect(
      read("q=entropy&mode=hybrid&year=2024&type=question&e=ama-2024-06&s=ama-2024-06%23q07")
    ).toEqual({
      query: "entropy",
      mode: "hybrid",
      year: "2024",
      type: "question",
      episode: "ama-2024-06",
      segment: "ama-2024-06#q07"
    });
  });

  it("falls back to safe defaults for unknown mode/type values", () => {
    const state = read("mode=telepathy&type=banana");
    expect(state.mode).toBe("hybrid");
    expect(state.type).toBe("all");
  });
});
