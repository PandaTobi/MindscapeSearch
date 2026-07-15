import type { SearchMode, SegmentType } from "./types";

export interface QueryState {
  query: string;
  mode: SearchMode;
  year: string;
  type: "all" | SegmentType;
  episode: string;
  /** segmentId of the transcript panel's open, deep-linked segment ("" = closed). */
  segment: string;
}
export const defaultQueryState: QueryState = {
  query: "",
  mode: "keyword",
  year: "",
  type: "all",
  episode: "",
  segment: ""
};

export function readQueryState(params = new URLSearchParams(window.location.search)): QueryState {
  const mode = params.get("mode");
  const type = params.get("type");
  return {
    query: params.get("q") ?? "",
    mode: mode === "semantic" || mode === "hybrid" ? mode : "keyword",
    year: params.get("year") ?? "",
    type:
      type === "question" || type === "answer" || type === "intro" || type === "other"
        ? type
        : "all",
    episode: params.get("e") ?? "",
    segment: params.get("s") ?? ""
  };
}
export function writeQueryState(state: QueryState) {
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);
  if (state.mode !== "keyword") params.set("mode", state.mode);
  if (state.year) params.set("year", state.year);
  if (state.type !== "all") params.set("type", state.type);
  if (state.episode) params.set("e", state.episode);
  if (state.segment) params.set("s", state.segment);
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${params.size ? `?${params}` : ""}`
  );
}

/** The canonical, shareable pointer to one answer — independent of the
 * searcher's own query/filters, per DESIGN.md §2.3 ("⧉ Copy link"). */
export function segmentDeepLink(episodeId: string, segmentId: string) {
  const params = new URLSearchParams({ e: episodeId, s: segmentId });
  return `${window.location.origin}${window.location.pathname}?${params}`;
}
