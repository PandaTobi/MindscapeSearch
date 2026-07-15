import type { QueryState } from "./url-state";

const TYPE_LABEL: Record<Exclude<QueryState["type"], "all">, string> = {
  question: "Questions",
  answer: "Answers",
  intro: "Intro",
  other: "Other"
};

/** Shared by the filter rail's chips and NoResultsState's "remove filter"
 * recovery links, so the two can never drift apart. */
export function buildFilterChips(
  state: QueryState,
  episodes: Array<{ id: string; number: number }>
): Array<{ key: string; label: string }> {
  const activeEpisode = episodes.find((episode) => episode.id === state.episode);
  return [
    state.year ? { key: "year", label: `Year: ${state.year}` } : null,
    activeEpisode ? { key: "episode", label: `Episode: AMA ${activeEpisode.number}` } : null,
    state.type !== "all" ? { key: "type", label: TYPE_LABEL[state.type] } : null
  ].filter((chip): chip is { key: string; label: string } => chip !== null);
}
