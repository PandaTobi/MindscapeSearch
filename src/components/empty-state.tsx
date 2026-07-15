"use client";

import type { RecentSearch } from "@/lib/recent-searches";
import { SampleQueries } from "@/components/sample-queries";

const MODE_LABEL: Record<RecentSearch["mode"], string> = {
  keyword: "Keyword",
  hybrid: "Hybrid",
  semantic: "Semantic"
};

/** The "quiet launcher" shown under the docked input once a query is cleared
 * mid-session (DESIGN.md §2.5). First-ever visit has no recents, so it
 * degrades to samples-only — the same component HomeHero uses, at a denser
 * layout. */
export function EmptyState({
  recents,
  onRerun,
  onRemove,
  onSelectSample
}: {
  recents: RecentSearch[];
  onRerun: (entry: RecentSearch) => void;
  onRemove: (entry: RecentSearch) => void;
  onSelectSample: (query: string) => void;
}) {
  return (
    <div className="mx-auto max-w-md px-4 py-10 text-center">
      {recents.length > 0 && (
        <div className="mb-10 text-left">
          <p className="mb-2 text-micro uppercase tracking-[0.06em] text-text-tertiary">Recent searches</p>
          <ul
            onKeyDown={(event) => {
              const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[data-recent-row]"));
              const currentIndex = items.findIndex((item) => item === document.activeElement);
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const next = event.key === "ArrowDown" ? currentIndex + 1 : currentIndex - 1;
                items[Math.max(0, Math.min(items.length - 1, next))]?.focus();
              }
            }}
          >
            {recents.map((entry) => (
              <li key={`${entry.query}:${entry.mode}`}>
                <div className="group flex items-center gap-2 rounded-md py-1.5 hover:bg-bg-raised">
                  <button
                    type="button"
                    data-recent-row
                    onClick={() => onRerun(entry)}
                    onKeyDown={(event) => {
                      if (event.key === "Backspace" || event.key === "Delete") {
                        event.preventDefault();
                        onRemove(entry);
                      }
                    }}
                    className="flex-1 truncate px-2 text-left text-body text-text-secondary transition-colors duration-[120ms] hover:text-text-primary focus-visible:text-text-primary"
                  >
                    {entry.query}
                    <span className="ml-2 font-mono text-micro text-text-tertiary">
                      {MODE_LABEL[entry.mode]}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove "${entry.query}" from recent searches`}
                    onClick={() => onRemove(entry)}
                    className="px-2 text-text-tertiary opacity-0 transition-opacity duration-[120ms] hover:text-text-primary focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    ⌫
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <SampleQueries heading="Try asking about" onSelect={onSelectSample} />
      <p className="mt-10 font-mono text-micro text-text-tertiary">
        ↑↓ navigate · ⏎ open · / focus · ? shortcuts
      </p>
    </div>
  );
}
