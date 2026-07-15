"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { ResultCard } from "@/components/result-card";
import { SkeletonCard } from "@/components/skeleton-card";
import type { SearchMode, SearchResult } from "@/lib/types";

const BATCH_SIZE = 24;
const ESTIMATED_ROW_HEIGHT = 176;

/** Virtualized, infinitely-scrolling result list. Every fetched result already
 * lives in memory (the worker resolves up to ~200 ranked hits per query), so
 * "infinite scroll" here means progressively revealing + windowing that local
 * list rather than paging the network — see SPEC.md §11 ("keyword index for
 * the active filter set stays resident"). A brief skeleton batch still marks
 * each reveal so scrolling never visibly bottoms out (DESIGN.md §2.2). */
export function ResultsList({
  results,
  terms,
  mode,
  answersOnly,
  activeIndex,
  navSeq,
  onActivate,
  onOpenTranscript
}: {
  results: SearchResult[];
  terms: string[];
  mode: SearchMode;
  answersOnly: boolean;
  activeIndex: number;
  /** Bumped by the caller only on explicit keyboard navigation (arrow keys)
   * — distinguishes "user moved the cursor" from the activeIndex(0) reset
   * that arrives together with a brand new result set, which should NOT
   * yank the scroll position. */
  navSeq: number;
  onActivate: (index: number) => void;
  onOpenTranscript: (segmentId: string) => void;
}) {
  const [revealCount, setRevealCount] = useState(BATCH_SIZE);
  const [growing, setGrowing] = useState(false);
  const [scrollMargin, setScrollMargin] = useState(0);
  const listRef = useRef<HTMLOListElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // The window virtualizer needs the list's offset from the top of the
  // document; recompute whenever content above it (header, filter chips,
  // download strip) could have changed height.
  useLayoutEffect(() => {
    setScrollMargin(listRef.current?.offsetTop ?? 0);
  }, [results]);

  // Reset paging whenever the underlying result set changes (new query/filter).
  useEffect(() => {
    setRevealCount(Math.min(BATCH_SIZE, results.length || BATCH_SIZE));
    setGrowing(false);
  }, [results]);

  const visible = results.slice(0, revealCount);
  const hasMore = revealCount < results.length;

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || growing) return;
        setGrowing(true);
        window.setTimeout(() => {
          setRevealCount((count) => Math.min(count + BATCH_SIZE, results.length));
          setGrowing(false);
        }, 200);
      },
      { rootMargin: "800px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, growing, results.length]);

  const virtualizer = useWindowVirtualizer({
    count: visible.length,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 8,
    scrollMargin
  });
  // The default scroll-anchoring compensation (nudge window.scrollY to offset
  // an above-the-fold item's estimate→actual size delta) fires the moment
  // each card is first measured — including during the very first commit,
  // where it reads as an unwanted jump away from the top the user just
  // landed at. We don't need that anchoring: results always start at the top
  // of a fresh query. Not exposed as a constructor option in this version,
  // and setting it via an effect would run after that first commit's ref
  // callbacks already fired, so it's assigned directly during render instead
  // — an idempotent instance-config mutation, not a render-output change.
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = () => false;

  // Scroll only in response to an explicit navigation event (see navSeq's
  // doc comment) — never as a side effect of a fresh result set landing.
  useEffect(() => {
    if (navSeq === 0) return;
    if (activeIndex >= 0 && activeIndex < visible.length) {
      virtualizer.scrollToIndex(activeIndex, { align: "auto" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navSeq]);

  const items = virtualizer.getVirtualItems();

  return (
    <div>
      <ol
        ref={listRef}
        role="listbox"
        aria-label="Search results"
        className="relative"
        style={{ height: virtualizer.getTotalSize(), overflowAnchor: "none" }}
      >
        {items.map((virtualRow) => {
          const result = visible[virtualRow.index];
          return (
            <div
              key={result.segmentId}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 top-0 w-full animate-rise motion-reduce:animate-none"
              style={{ transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)` }}
            >
              <ResultCard
                result={result}
                terms={terms}
                mode={mode}
                answersOnly={answersOnly}
                isActive={virtualRow.index === activeIndex}
                onActivate={() => onActivate(virtualRow.index)}
                onOpenTranscript={onOpenTranscript}
              />
            </div>
          );
        })}
      </ol>
      {hasMore && (
        <>
          <div ref={sentinelRef} aria-hidden="true" className="h-px" />
          {growing && (
            <ul aria-hidden="true">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </ul>
          )}
        </>
      )}
    </div>
  );
}
