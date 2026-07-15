import { FilterContent, type EpisodeFacetItem, type YearFacet } from "@/components/filter-content";
import type { QueryState } from "@/lib/url-state";

export function FilterRail({
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
  return (
    <aside
      aria-label="Filters"
      className="hidden h-fit w-rail shrink-0 lg:sticky lg:top-[9.5rem] lg:block"
    >
      <FilterContent state={state} years={years} episodes={episodes} onChange={onChange} />
    </aside>
  );
}
