"use client";

import { useEffect, useRef, useState } from "react";
import { SearchInput } from "@/components/search-input";
import { ModeSwitch, ModelDownloadStrip } from "@/components/mode-switch";
import { ThemeToggle } from "@/components/theme-toggle";
import { FiltersPill } from "@/components/filter-sheet";
import type { SearchMode } from "@/lib/types";

export function SearchHeader({
  query,
  onQueryChange,
  mode,
  onModeChange,
  suggestions,
  loadingIndex,
  semanticCached,
  downloadStripState,
  theme,
  onToggleTheme,
  filtersActiveCount,
  onOpenFilters,
  inputRef,
  onArrowIntoResults,
  onEnterActiveCard
}: {
  query: string;
  onQueryChange: (value: string) => void;
  mode: SearchMode;
  onModeChange: (mode: SearchMode) => void;
  suggestions: string[];
  loadingIndex: boolean;
  semanticCached: boolean;
  downloadStripState: "loading" | "ready" | "hidden";
  theme: string;
  onToggleTheme: () => void;
  filtersActiveCount: number;
  onOpenFilters: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onArrowIntoResults: (direction: "down" | "up") => void;
  onEnterActiveCard: (withModifier: boolean) => void;
}) {
  const [scrolled, setScrolled] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting), {
      threshold: 1
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={sentinel} aria-hidden="true" />
      <header
        className={`sticky top-0 z-20 bg-bg/95 backdrop-blur transition-shadow duration-[120ms] ${
          scrolled ? "border-b border-border" : "border-b border-transparent"
        }`}
      >
        <div className="mx-auto flex max-w-6xl items-start gap-6 px-5 py-4 sm:px-8">
          <a href="." className="mt-3 shrink-0 text-caption font-semibold text-text-primary">
            Mindscape AMA
          </a>
          <div className="min-w-0 flex-1">
            <SearchInput
              value={query}
              onChange={onQueryChange}
              suggestions={suggestions}
              loadingIndex={loadingIndex}
              inputRef={inputRef}
              onArrowIntoResults={onArrowIntoResults}
              onEnterActiveCard={onEnterActiveCard}
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <ModeSwitch mode={mode} onChange={onModeChange} semanticCached={semanticCached} />
              <FiltersPill activeCount={filtersActiveCount} onOpen={onOpenFilters} />
            </div>
            <ModelDownloadStrip state={downloadStripState} />
          </div>
          <div className="mt-1 shrink-0">
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          </div>
        </div>
      </header>
    </>
  );
}
