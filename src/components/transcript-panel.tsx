"use client";

import { useEffect, useRef, useState } from "react";
import { HighlightedText } from "@/components/highlighted-text";
import { JumpToQuestionPalette } from "@/components/jump-to-question-palette";
import { findAllRanges } from "@/lib/highlight";
import { mediaUrl, monthYear, secondsToClock } from "@/lib/format";
import { segmentDeepLink } from "@/lib/url-state";
import type { EpisodeMeta, Segment } from "@/lib/types";

const isTypingTarget = (el: Element | null) =>
  !!el &&
  (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || (el as HTMLElement).isContentEditable);

export function TranscriptPanel({
  episode,
  segments,
  loading,
  targetSegmentId,
  terms,
  pulseOnOpen,
  paletteOpen,
  onPaletteOpenChange,
  onClose
}: {
  episode: EpisodeMeta | null;
  segments: Segment[];
  loading: boolean;
  targetSegmentId: string;
  terms: string[];
  pulseOnOpen: boolean;
  paletteOpen: boolean;
  onPaletteOpenChange: (open: boolean) => void;
  onClose: () => void;
}) {
  const [emphasizedId, setEmphasizedId] = useState(targetSegmentId);
  const [pulse, setPulse] = useState(pulseOnOpen);
  const rowRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEmphasizedId(targetSegmentId);
  }, [targetSegmentId]);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  useEffect(() => {
    rowRefs.current.get(emphasizedId)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [emphasizedId, segments]);

  useEffect(() => {
    if (!pulse) return;
    const timer = window.setTimeout(() => setPulse(false), 800);
    return () => window.clearTimeout(timer);
  }, [pulse]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (paletteOpen || isTypingTarget(document.activeElement)) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "j") {
        event.preventDefault();
        onPaletteOpenChange(true);
        return;
      }
      if (event.key === "j" || event.key === "k") {
        if (!segments.length) return;
        event.preventDefault();
        const index = segments.findIndex((s) => s.segmentId === emphasizedId);
        const next =
          event.key === "j" ? Math.min(index + 1, segments.length - 1) : Math.max(index - 1, 0);
        setEmphasizedId(segments[next]?.segmentId ?? emphasizedId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [segments, emphasizedId, paletteOpen, onPaletteOpenChange]);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={episode ? `Transcript: ${episode.title}` : "Transcript"}
      tabIndex={-1}
      className="fixed inset-0 z-40 flex animate-rise flex-col border-border bg-bg outline-none duration-[240ms] ease-panel motion-reduce:animate-none lg:inset-y-0 lg:left-auto lg:right-0 lg:w-[55%] lg:border-l"
    >
      <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-8">
        <div className="min-w-0">
          <p className="font-mono text-micro uppercase tracking-[0.06em] text-text-tertiary">
            {episode ? `AMA · ${monthYear(episode.date)} · AMA ${episode.number}` : "Transcript"}
          </p>
          <h2 className="mt-1 truncate text-title text-text-primary">
            {episode?.title ?? "Loading…"}
          </h2>
          {episode && (
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-text-tertiary">
              {episode.youtubeId && (
                <a
                  className="transition-colors duration-[120ms] hover:text-text-primary"
                  href={mediaUrl(episode.youtubeId, episode.audioUrl, null)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  ▶ YouTube
                </a>
              )}
              <a
                className="transition-colors duration-[120ms] hover:text-text-primary"
                href={episode.audioUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                ♫ Audio
              </a>
              <button
                type="button"
                className="transition-colors duration-[120ms] hover:text-text-primary"
                onClick={() =>
                  navigator.clipboard.writeText(segmentDeepLink(episode.id, emphasizedId))
                }
              >
                ⧉ Share episode
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          aria-label="Close transcript"
          onClick={onClose}
          className="shrink-0 rounded-md border border-border px-2.5 py-1.5 text-text-tertiary transition-colors duration-[120ms] hover:text-text-primary"
        >
          ✕
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-8">
        {loading && <p className="text-caption text-text-tertiary">Loading transcript…</p>}
        <ol className="mx-auto max-w-read space-y-1">
          {segments.map((segment) => {
            const isEmphasized = segment.segmentId === emphasizedId;
            return (
              <li
                key={segment.segmentId}
                ref={(el) => {
                  if (el) rowRefs.current.set(segment.segmentId, el);
                  else rowRefs.current.delete(segment.segmentId);
                }}
                className={`rounded-md py-2.5 pl-3 transition-colors duration-[120ms] ${
                  isEmphasized
                    ? `border-l-2 border-accent ${pulse ? "animate-pulse-bg" : ""}`
                    : "border-l-2 border-transparent"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setEmphasizedId(segment.segmentId)}
                  className="flex w-full items-baseline gap-3 text-left"
                >
                  <span
                    className={
                      isEmphasized
                        ? "flex-1 text-title text-text-primary"
                        : "line-clamp-2 flex-1 text-body text-text-secondary hover:text-text-primary"
                    }
                  >
                    {segment.questionText}
                  </span>
                  <span className="shrink-0 font-mono text-micro text-text-tertiary">
                    {secondsToClock(segment.startSec)}
                  </span>
                </button>
                {isEmphasized && (
                  <div className="mt-3 whitespace-pre-line text-body-read text-text-primary">
                    <HighlightedText
                      text={segment.answerText}
                      ranges={findAllRanges(segment.answerText, terms)}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      {paletteOpen && (
        <JumpToQuestionPalette
          segments={segments}
          onJump={(segmentId) => {
            setEmphasizedId(segmentId);
            onPaletteOpenChange(false);
          }}
          onClose={() => onPaletteOpenChange(false)}
        />
      )}
    </div>
  );
}
