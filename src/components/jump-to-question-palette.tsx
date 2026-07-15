"use client";

import { useEffect, useRef, useState } from "react";
import { secondsToClock } from "@/lib/format";
import type { Segment } from "@/lib/types";

/** ⌘J — jump-to-question palette scoped to the open episode's transcript,
 * replacing a persistent sidebar (DESIGN.md §2.4). */
export function JumpToQuestionPalette({
  segments,
  onJump,
  onClose
}: {
  segments: Segment[];
  onJump: (segmentId: string) => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);
  const query = filter.trim().toLowerCase();
  const matches = (query ? segments.filter((s) => s.questionText.toLowerCase().includes(query)) : segments).slice(
    0,
    20
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-24">
      <button type="button" aria-label="Close" className="absolute inset-0" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Jump to question"
        className="relative w-full max-w-lg overflow-hidden rounded-lg border border-border bg-bg-raised"
        onKeyDown={(event) => {
          // Escape is handled centrally (search-app's global keymap owns
          // overlay-priority); this only needs the palette-specific Enter.
          if (event.key === "Enter" && matches[0]) {
            onJump(matches[0].segmentId);
          }
        }}
      >
        <input
          ref={inputRef}
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Jump to a question…"
          className="w-full border-b border-border bg-transparent px-4 py-3 text-body text-text-primary placeholder:text-text-tertiary focus-visible:outline-none"
        />
        <ul className="max-h-80 overflow-y-auto py-1">
          {matches.map((segment) => (
            <li key={segment.segmentId}>
              <button
                type="button"
                onClick={() => onJump(segment.segmentId)}
                className="flex w-full items-center gap-3 px-4 py-2 text-left text-body text-text-secondary hover:bg-bg hover:text-text-primary"
              >
                <span className="flex-1 truncate">{segment.questionText}</span>
                <span className="shrink-0 font-mono text-micro text-text-tertiary">
                  {secondsToClock(segment.startSec)}
                </span>
              </button>
            </li>
          ))}
          {!matches.length && <p className="px-4 py-3 text-caption text-text-tertiary">No questions match.</p>}
        </ul>
      </div>
    </div>
  );
}
