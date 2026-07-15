"use client";

import { useEffect, useState } from "react";
import { pickSampleQueries } from "@/lib/sample-queries";

/** Real, evocative queries as quoted text links — DESIGN.md §2.1: "these teach
 * the corpus's voice better than any onboarding copy." Shared by HomeHero and
 * EmptyState at two densities. Picked client-side after mount so a static
 * export never ships a server/client markup mismatch. */
export function SampleQueries({
  heading,
  onSelect
}: {
  heading?: string;
  onSelect: (query: string) => void;
}) {
  const [queries, setQueries] = useState<string[]>([]);
  useEffect(() => setQueries(pickSampleQueries(3)), []);
  if (!queries.length) return null;
  return (
    <div className="text-center">
      {heading && (
        <p className="mb-2 text-micro uppercase tracking-[0.06em] text-text-tertiary">{heading}</p>
      )}
      <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-body text-text-secondary">
        {queries.map((query, index) => (
          <span key={query}>
            <button
              type="button"
              onClick={() => onSelect(query)}
              className="transition-colors duration-[120ms] hover:text-accent"
            >
              &ldquo;{query}&rdquo;
            </button>
            {index < queries.length - 1 && (
              <span aria-hidden="true" className="ml-2 text-text-tertiary">
                ·
              </span>
            )}
          </span>
        ))}
      </p>
    </div>
  );
}
