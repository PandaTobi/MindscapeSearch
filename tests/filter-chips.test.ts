import { describe, expect, it } from "vitest";
import { buildFilterChips } from "../src/lib/filter-chips";
import { defaultQueryState } from "../src/lib/url-state";

const episodes = [
  { id: "ama-2024-06", number: 50 },
  { id: "ama-2023-01", number: 30 }
];

describe("buildFilterChips", () => {
  it("is empty when no filters are active", () => {
    expect(buildFilterChips(defaultQueryState, episodes)).toEqual([]);
  });

  it("emits a chip per active filter with stable keys", () => {
    const chips = buildFilterChips(
      { ...defaultQueryState, year: "2024", episode: "ama-2024-06", type: "answer" },
      episodes
    );
    expect(chips).toEqual([
      { key: "year", label: "Year: 2024" },
      { key: "episode", label: "Episode: AMA 50" },
      { key: "type", label: "Answers" }
    ]);
  });

  it("omits the episode chip when the id is not in the facet list", () => {
    const chips = buildFilterChips({ ...defaultQueryState, episode: "ama-unknown" }, episodes);
    expect(chips).toEqual([]);
  });
});
