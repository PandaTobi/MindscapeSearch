"use client";

import { SearchInput } from "@/components/search-input";
import { ModeSwitch, ModelDownloadStrip } from "@/components/mode-switch";
import { ThemeToggle } from "@/components/theme-toggle";
import { SampleQueries } from "@/components/sample-queries";
import type { SearchMode } from "@/lib/types";

export function HomeHero({
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
  inputRef,
  onArrowIntoResults,
  onEnterActiveCard,
  episodeCount,
  questionCount,
  updated
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
  inputRef: React.RefObject<HTMLInputElement | null>;
  onArrowIntoResults: (direction: "down" | "up") => void;
  onEnterActiveCard: (withModifier: boolean) => void;
  episodeCount: number;
  questionCount: number;
  updated: string | null;
}) {
  return (
    <div className="flex min-h-screen flex-col px-5 sm:px-8">
      <div className="flex justify-end pt-6">
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center pb-[12vh] pt-[6vh]">
        <div className="mb-8 text-center">
          <h1 className="text-display text-text-primary">Mindscape AMA</h1>
          <p className="mt-2 text-body text-text-secondary">
            Search 8 years of Sean Carroll&rsquo;s answers
          </p>
        </div>
        <SearchInput
          value={query}
          onChange={onQueryChange}
          suggestions={suggestions}
          loadingIndex={loadingIndex}
          inputRef={inputRef}
          onArrowIntoResults={onArrowIntoResults}
          onEnterActiveCard={onEnterActiveCard}
        />
        <div className="mt-3 flex flex-col items-center gap-2">
          <ModeSwitch mode={mode} onChange={onModeChange} semanticCached={semanticCached} />
          <p className="text-micro uppercase tracking-[0.06em] text-text-tertiary">⏎ to search</p>
        </div>
        <div className="mx-auto w-full max-w-sm">
          <ModelDownloadStrip state={downloadStripState} />
        </div>
        <div className="mt-10">
          <SampleQueries onSelect={onQueryChange} />
        </div>
      </div>
      {(episodeCount > 0 || questionCount > 0) && (
        <footer className="border-t border-border py-4 text-center font-mono text-micro text-text-tertiary">
          {episodeCount} episodes · {questionCount.toLocaleString()} questions
          {updated && ` · updated ${updated}`}
        </footer>
      )}
    </div>
  );
}
