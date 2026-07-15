"use client";

import type { SearchMode } from "@/lib/types";

/** Distinct from EmptyState: a query ran and returned nothing. Recovery
 * actions are computed from real state, never generic filler copy
 * (DESIGN.md §2.7). */
export function NoResultsState({
  query,
  mode,
  didYouMean,
  filterChips,
  onRetryQuery,
  onSetMode,
  onRemoveChip
}: {
  query: string;
  mode: SearchMode;
  didYouMean: string | null;
  filterChips: Array<{ key: string; label: string }>;
  onRetryQuery: (query: string) => void;
  onSetMode: (mode: SearchMode) => void;
  onRemoveChip: (key: string) => void;
}) {
  const hasRecovery = didYouMean || filterChips.length > 0 || mode === "keyword";
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <p className="text-body-read text-text-secondary">
        No matches for &ldquo;<span className="text-text-primary">{query}</span>&rdquo;
      </p>
      {didYouMean && (
        <p className="mt-3 text-body text-text-secondary">
          Did you mean{" "}
          <button
            type="button"
            onClick={() => onRetryQuery(didYouMean)}
            className="text-accent underline decoration-dotted underline-offset-2"
          >
            &ldquo;{didYouMean}&rdquo;
          </button>
          ?
        </p>
      )}
      {hasRecovery && (
        <p className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-caption text-text-tertiary">
          <span>Try:</span>
          {mode === "keyword" && (
            <button
              type="button"
              onClick={() => onSetMode("hybrid")}
              className="text-accent transition-colors duration-[120ms] hover:text-text-primary"
            >
              Hybrid search
            </button>
          )}
          {filterChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => onRemoveChip(chip.key)}
              className="text-accent transition-colors duration-[120ms] hover:text-text-primary"
            >
              Remove filter: {chip.label}
            </button>
          ))}
        </p>
      )}
    </div>
  );
}
