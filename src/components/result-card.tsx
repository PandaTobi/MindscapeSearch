"use client";

import { useEffect, useState } from "react";
import { HighlightedText } from "@/components/highlighted-text";
import { countMatches } from "@/lib/highlight";
import { episodeBadge, mediaUrl, questionLabel, secondsToClock } from "@/lib/format";
import { segmentDeepLink } from "@/lib/url-state";
import type { SearchMode, SearchResult } from "@/lib/types";

interface ResultCardProps {
  result: SearchResult;
  terms: string[];
  mode: SearchMode;
  answersOnly: boolean;
  isActive: boolean;
  onActivate: () => void;
  onOpenTranscript: (segmentId: string) => void;
  cardRef: (el: HTMLLIElement | null) => void;
}

export function ResultCard({
  result,
  terms,
  mode,
  answersOnly,
  isActive,
  onActivate,
  onOpenTranscript,
  cardRef
}: ResultCardProps) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const snippet = result.match ?? result.answerText;
  const answerRanges = result.highlights?.answer ?? [];
  const questionRanges = result.highlights?.question ?? [];
  const hasExactMatch = answerRanges.length > 0 || questionRanges.length > 0;
  const isSemanticOnly = mode !== "keyword" && terms.length > 0 && !hasExactMatch;
  const matchCount = countMatches(result.answerText, terms);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(segmentDeepLink(result.episode.id, result.segmentId));
      setCopied(true);
    } catch {
      // Clipboard access can be denied — the label simply won't confirm.
    }
  };

  return (
    <li
      ref={cardRef}
      role="option"
      aria-selected={isActive}
      tabIndex={-1}
      className={`group relative border-b border-border px-1 py-5 transition-colors duration-[120ms] ${
        isActive ? "bg-bg-raised" : "hover:bg-bg-raised"
      }`}
      onMouseEnter={onActivate}
    >
      <span
        aria-hidden="true"
        className={`absolute left-0 top-0 h-full w-0.5 bg-accent transition-opacity duration-[120ms] ${
          isActive ? "opacity-100" : "opacity-0"
        }`}
      />
      <div className="flex flex-wrap items-center gap-x-2 px-4 font-mono text-micro uppercase tracking-[0.06em] text-text-tertiary">
        <span>{episodeBadge(result.episode.date)}</span>
        <span aria-hidden="true">—</span>
        <span>{questionLabel(result.segmentId)}</span>
        <span className="ml-auto">{secondsToClock(result.startSec)}</span>
      </div>

      {result.questionText && (
        <h2
          className={`px-4 ${
            answersOnly
              ? "mt-1.5 line-clamp-2 text-caption text-text-secondary"
              : "mt-1.5 line-clamp-2 text-question text-text-primary"
          }`}
        >
          <HighlightedText text={result.questionText} ranges={questionRanges} />
        </h2>
      )}

      <p
        className={`mt-2 line-clamp-3 whitespace-pre-line px-4 text-body text-text-secondary ${
          answersOnly ? "text-body-read text-text-primary" : ""
        } ${isSemanticOnly ? "border-l-2 border-accent pl-3" : ""}`}
      >
        <HighlightedText text={snippet} ranges={isSemanticOnly ? [] : answerRanges} />
        {matchCount > 1 && (
          <span className="ml-2 whitespace-nowrap font-mono text-micro text-text-tertiary">
            {matchCount} matches in answer
          </span>
        )}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-4 px-4 text-caption text-text-tertiary">
        <a
          className="transition-colors duration-[120ms] hover:text-text-primary focus-visible:text-text-primary"
          href={mediaUrl(result.episode.youtubeId, result.episode.audioUrl, result.startSec)}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span aria-hidden="true">▶ </span>
          Play at {secondsToClock(result.startSec)}
        </a>
        <button
          type="button"
          className="transition-colors duration-[120ms] hover:text-text-primary focus-visible:text-text-primary"
          onClick={() => onOpenTranscript(result.segmentId)}
        >
          Open transcript
        </button>
        <button
          type="button"
          className="transition-colors duration-[120ms] hover:text-text-primary focus-visible:text-text-primary"
          onClick={copyLink}
        >
          <span aria-hidden="true">⧉ </span>
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </li>
  );
}
