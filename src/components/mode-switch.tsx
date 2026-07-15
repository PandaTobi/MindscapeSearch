"use client";

import type { SearchMode } from "@/lib/types";

const MODES: Array<{ value: SearchMode; label: string; shortcut: string }> = [
  { value: "keyword", label: "Keyword", shortcut: "g k" },
  { value: "hybrid", label: "Hybrid", shortcut: "g h" },
  { value: "semantic", label: "Semantic", shortcut: "g s" }
];

export function ModeSwitch({
  mode,
  onChange,
  semanticCached
}: {
  mode: SearchMode;
  onChange: (mode: SearchMode) => void;
  semanticCached: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Search mode"
      className="flex items-center gap-4 text-caption"
    >
      {MODES.map((option) => {
        const active = mode === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={`Shortcut: ${option.shortcut}`}
            onClick={() => onChange(option.value)}
            className={`border-b-2 pb-0.5 transition-colors duration-[120ms] ${
              active
                ? "border-accent text-text-primary"
                : "border-transparent text-text-tertiary hover:text-text-secondary"
            }`}
          >
            {option.label}
            {option.value === "semantic" && !semanticCached && (
              <span className="ml-1.5 font-mono text-micro text-text-tertiary">↓ ~2 MB</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Inline, dismissible strip announcing the one-time semantic model
 * download — never a modal, never a gate (DESIGN.md §2.6.3). Progress is
 * shown as an indeterminate sweep: the loader doesn't currently report
 * byte-level progress, and a fabricated percentage would be dishonest. */
export function ModelDownloadStrip({ state }: { state: "loading" | "ready" | "hidden" }) {
  if (state === "hidden") return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="mt-2 flex items-center gap-3 rounded-md border border-border bg-bg-raised px-3 py-2 text-caption text-text-tertiary"
    >
      {state === "loading" ? (
        <>
          <div className="h-1 w-24 overflow-hidden rounded-full bg-border">
            <div className="h-full w-1/2 animate-shimmer bg-accent motion-reduce:animate-none" />
          </div>
          <span>Downloading semantic model · cached after this</span>
        </>
      ) : (
        <span>Semantic search ready</span>
      )}
    </div>
  );
}
