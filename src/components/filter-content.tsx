import { ActiveFilterChips, EpisodeFacet, FacetGroup, FacetRow } from "@/components/facets";
import { buildFilterChips } from "@/lib/filter-chips";
import type { QueryState } from "@/lib/url-state";

export interface YearFacet {
  year: number;
  count: number;
}
export interface EpisodeFacetItem {
  id: string;
  number: number;
  title: string;
  year: number;
  count: number;
}

const TYPE_OPTIONS: Array<{ value: QueryState["type"]; label: string }> = [
  { value: "all", label: "All" },
  { value: "question", label: "Questions" },
  { value: "answer", label: "Answers" }
];

export function FilterContent({
  state,
  years,
  episodes,
  onChange
}: {
  state: QueryState;
  years: YearFacet[];
  episodes: EpisodeFacetItem[];
  onChange: (patch: Partial<QueryState>) => void;
}) {
  const chips = buildFilterChips(state, episodes);

  const removeChip = (key: string) => {
    if (key === "year") onChange({ year: "" });
    if (key === "episode") onChange({ episode: "" });
    if (key === "type") onChange({ type: "all" });
  };

  return (
    <div>
      <ActiveFilterChips chips={chips} onRemove={removeChip} />
      <FacetGroup title="Type">
        {TYPE_OPTIONS.map((option) => (
          <FacetRow
            key={option.value}
            label={option.label}
            active={state.type === option.value}
            onSelect={() => onChange({ type: option.value })}
          />
        ))}
      </FacetGroup>
      <FacetGroup title="Year">
        <FacetRow label="All years" active={!state.year} onSelect={() => onChange({ year: "" })} />
        {years.map((facet) => (
          <FacetRow
            key={facet.year}
            label={String(facet.year)}
            count={facet.count}
            active={state.year === String(facet.year)}
            onSelect={() => onChange({ year: String(facet.year) })}
          />
        ))}
      </FacetGroup>
      <FacetGroup title="Episode">
        <EpisodeFacet episodes={episodes} activeId={state.episode} onSelect={(id) => onChange({ episode: id })} />
      </FacetGroup>
    </div>
  );
}
