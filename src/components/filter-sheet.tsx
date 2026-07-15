"use client";

import { FilterContent, type EpisodeFacetItem, type YearFacet } from "@/components/filter-content";
import { useFocusTrap } from "@/lib/use-focus-trap";
import type { QueryState } from "@/lib/url-state";

export function FiltersPill({ activeCount, onOpen }: { activeCount: number; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="rounded-md border border-border px-3 py-1.5 text-caption text-text-secondary transition-colors duration-[120ms] hover:text-text-primary lg:hidden"
    >
      Filters{activeCount > 0 ? ` (${activeCount})` : ""}
    </button>
  );
}

export function FilterSheet({
  open,
  onOpenChange,
  state,
  years,
  episodes,
  onChange
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: QueryState;
  years: YearFacet[];
  episodes: EpisodeFacetItem[];
  onChange: (patch: Partial<QueryState>) => void;
}) {
  const trapRef = useFocusTrap<HTMLDivElement>(open);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 lg:hidden">
      <button
        type="button"
        aria-label="Close filters"
        className="absolute inset-0 bg-black/40"
        onClick={() => onOpenChange(false)}
      />
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label="Filters"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onOpenChange(false);
          }
        }}
        className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-lg border-t border-border bg-bg p-5 outline-none sm:inset-x-auto sm:bottom-auto sm:right-5 sm:top-32 sm:w-80 sm:rounded-lg sm:border"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-caption font-medium text-text-primary">Filters</h2>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close filters"
            className="text-text-tertiary hover:text-text-primary"
          >
            ✕
          </button>
        </div>
        <FilterContent state={state} years={years} episodes={episodes} onChange={onChange} />
      </div>
    </div>
  );
}
