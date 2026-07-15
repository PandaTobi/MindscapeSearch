"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SearchHeader } from "@/components/search-header";
import { HomeHero } from "@/components/home-hero";
import { FilterRail } from "@/components/filter-rail";
import { FilterSheet } from "@/components/filter-sheet";
import { ResultsList } from "@/components/results-list";
import { ResultsMeta } from "@/components/results-meta";
import { EmptyState } from "@/components/empty-state";
import { NoResultsState } from "@/components/no-results-state";
import { SkeletonList } from "@/components/skeleton-card";
import { TranscriptPanel } from "@/components/transcript-panel";
import { ShortcutsOverlay } from "@/components/shortcuts-overlay";
import { buildFilterChips } from "@/lib/filter-chips";
import { monthYear } from "@/lib/format";
import {
  loadRecentSearches,
  pushRecentSearch,
  removeRecentSearch,
  type RecentSearch
} from "@/lib/recent-searches";
import {
  defaultQueryState,
  readQueryState,
  writeQueryState,
  segmentDeepLink,
  type QueryState
} from "@/lib/url-state";
import type { EpisodeMeta, Manifest, Segment, SearchMode, SearchResult } from "@/lib/types";
import type { WorkerRequest, WorkerResponse } from "@/lib/worker-protocol";

const asset = (path: string) => `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${path}`;
const MODE_CHORD_KEYS: Record<string, SearchMode> = { k: "keyword", h: "hybrid", s: "semantic" };
const SEMANTIC_CACHED_KEY = "mindscape:semantic-cached";
const CHORD_WINDOW_MS = 900;

/** Typed postMessage — the only writer to the worker's request channel. */
const postToWorker = (worker: Worker, message: WorkerRequest) => worker.postMessage(message);

const isTypingTarget = (el: Element | null) =>
  !!el &&
  (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || (el as HTMLElement).isContentEditable);

export function SearchApp() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [state, setState] = useState<QueryState>(defaultQueryState);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [terms, setTerms] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [status, setStatus] = useState("Loading index…");
  const [inFlight, setInFlight] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [showRerankNotice, setShowRerankNotice] = useState(false);
  const [theme, setTheme] = useState("dark");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [navSeq, setNavSeq] = useState(0);
  const [activated, setActivated] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [palettteOpen, setPaletteOpen] = useState(false);
  const [recents, setRecents] = useState<RecentSearch[]>([]);
  const [semanticCached, setSemanticCached] = useState(false);
  const [downloadStrip, setDownloadStrip] = useState<"loading" | "ready" | "hidden">("hidden");
  const [transcript, setTranscript] = useState<{
    episodeId: string;
    segments: Segment[];
    loading: boolean;
  } | null>(null);
  const [pulseOnOpen, setPulseOnOpen] = useState(false);

  const worker = useRef<Worker | null>(null);
  const queryId = useRef(0);
  const episodeRequestId = useRef(0);
  const dispatchedAt = useRef(0);
  const scrolledForId = useRef(0);
  const lastPartial = useRef(false);
  const initialSegmentRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Element that had focus when the transcript panel opened, so focus can be
  // restored to it on close (the panel is non-modal, so nothing else does).
  const panelTrigger = useRef<HTMLElement | null>(null);
  const prevSegment = useRef("");
  const chord = useRef<{ key: string; at: number } | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const resultsRef = useRef(results);
  resultsRef.current = results;
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;

  // ── Bootstrap: read URL state, theme, recents, and the manifest/worker ────
  useEffect(() => {
    const initial = readQueryState();
    setState(initial);
    if (initial.query || initial.segment) setActivated(true);
    initialSegmentRef.current = initial.segment || null;
    setTheme(document.documentElement.dataset.theme ?? "dark");
    setRecents(loadRecentSearches());
    setSemanticCached(localStorage.getItem(SEMANTIC_CACHED_KEY) === "1");
    fetch(asset("/data/manifest.json"))
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((m: Manifest) => {
        setManifest(m);
        worker.current = new Worker(asset("/search-worker.js"));
        postToWorker(worker.current, { type: "init", manifest: m });
      })
      .catch(() => setStatus("The search index has not been built yet."));
    return () => worker.current?.terminate();
  }, []);

  // ── Dispatch a (debounced) search whenever query state changes ───────────
  useEffect(() => {
    if (!worker.current) return;
    const timer = window.setTimeout(() => {
      writeQueryState(state);
      const id = ++queryId.current;
      dispatchedAt.current = performance.now();
      setInFlight(true);
      if (worker.current) postToWorker(worker.current, { type: "search", state, id });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [state]);

  // ── Worker responses ───────────────────────────────────────────────────
  useEffect(() => {
    if (!worker.current) return;
    worker.current.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (message.type === "ready") {
        setStatus("Ready");
        return;
      }
      if (message.type === "episode") {
        if (message.id !== episodeRequestId.current) return;
        setTranscript((prev) =>
          prev && prev.episodeId === message.episodeId
            ? { ...prev, segments: message.segments, loading: false }
            : prev
        );
        return;
      }
      if (message.id !== undefined && message.id !== queryId.current) return; // stale response
      if (message.type === "status") setStatus(message.text);
      if (message.type === "results") {
        // Scroll to top once per new query (not on the hybrid partial→final
        // patch for the same query, which should leave the reader in place).
        if (scrolledForId.current !== message.id) {
          scrolledForId.current = message.id;
          window.scrollTo({ top: 0 });
        }
        setInFlight(false);
        setResults(message.results);
        setTerms(message.terms ?? []);
        setSuggestions(message.suggestions ?? []);
        setActiveIndex(message.results.length ? 0 : -1);
        setLatencyMs(performance.now() - dispatchedAt.current);
        const count = `${message.results.length} result${message.results.length === 1 ? "" : "s"}`;
        setStatus(count);

        const wasPartial = lastPartial.current;
        lastPartial.current = !!message.partial;
        if (wasPartial && !message.partial) {
          setShowRerankNotice(true);
          window.setTimeout(() => setShowRerankNotice(false), 2000);
        }
        if (!message.partial && stateRef.current.mode !== "keyword" && terms.length) {
          setSemanticCached(true);
          localStorage.setItem(SEMANTIC_CACHED_KEY, "1");
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest]);

  // ── Semantic model download strip: mirrors the worker's status text ──────
  useEffect(() => {
    if (status === "Loading semantic model…") {
      setDownloadStrip("loading");
      return;
    }
    setDownloadStrip((prev) => {
      if (prev !== "loading") return prev === "ready" ? prev : "hidden";
      window.setTimeout(() => setDownloadStrip("hidden"), 2000);
      return "ready";
    });
  }, [status]);

  // Clearing the query drops into EmptyState, which is much shorter than a
  // results page — reset scroll so the reader isn't stranded mid-page.
  useEffect(() => {
    if (activated && !state.query) window.scrollTo({ top: 0 });
  }, [activated, state.query]);

  // ── Transcript panel: fetch the open episode's full segment list ─────────
  useEffect(() => {
    if (!state.segment || !worker.current) {
      setTranscript(null);
      return;
    }
    const episodeId = state.segment.slice(0, state.segment.indexOf("#"));
    const pulse = initialSegmentRef.current === state.segment;
    initialSegmentRef.current = null;
    setPulseOnOpen(pulse);
    setTranscript({ episodeId, segments: [], loading: true });
    const id = ++episodeRequestId.current;
    postToWorker(worker.current, { type: "episode", episodeId, id });
  }, [state.segment]);

  // Restore focus to the panel's trigger once it closes (open → closed). Runs
  // after the panel has unmounted, so the target is back in the layout.
  useEffect(() => {
    const closed = prevSegment.current && !state.segment;
    prevSegment.current = state.segment;
    if (!closed) return;
    const target = panelTrigger.current;
    panelTrigger.current = null;
    if (target && target.isConnected) target.focus();
    else inputRef.current?.focus();
  }, [state.segment]);

  const update = useCallback((patch: Partial<QueryState>) => {
    setState((v) => ({ ...v, ...patch }));
  }, []);

  const setQuery = useCallback(
    (query: string) => {
      if (query && !activated) setActivated(true);
      update({ query });
    },
    [activated, update]
  );

  const runQuery = useCallback(
    (query: string, mode?: SearchMode) => {
      setActivated(true);
      update({ query, ...(mode ? { mode } : {}) });
    },
    [update]
  );

  const commitToRecents = useCallback(() => {
    const q = stateRef.current.query.trim();
    if (!q) return;
    setRecents(pushRecentSearch(q, stateRef.current.mode));
  }, []);

  const moveActiveIndex = useCallback((direction: "down" | "up") => {
    const count = resultsRef.current.length;
    if (!count) return;
    setActiveIndex((i) => {
      if (direction === "down") return Math.min(i < 0 ? 0 : i + 1, count - 1);
      return Math.max(i - 1, 0);
    });
    setNavSeq((n) => n + 1);
  }, []);

  // Remember the trigger so focus can return to it when the panel closes.
  const openTranscript = useCallback(
    (segmentId: string) => {
      panelTrigger.current = document.activeElement as HTMLElement | null;
      update({ segment: segmentId });
    },
    [update]
  );

  const activateCard = useCallback(
    (withModifier: boolean) => {
      const active = resultsRef.current[activeIndexRef.current];
      if (!active) return;
      if (withModifier) {
        window.open(
          `https://www.youtube.com/watch?v=${active.episode.youtubeId ?? ""}`,
          "_blank",
          "noopener,noreferrer"
        );
        return;
      }
      openTranscript(active.segmentId);
    },
    [openTranscript]
  );

  const onEnterFromInput = useCallback(
    (withModifier: boolean) => {
      commitToRecents();
      activateCard(withModifier);
    },
    [commitToRecents, activateCard]
  );

  const copyActiveCardLink = useCallback(() => {
    const active = resultsRef.current[activeIndexRef.current];
    if (!active) return;
    navigator.clipboard.writeText(segmentDeepLink(active.episode.id, active.segmentId));
  }, []);

  const flipTheme = useCallback(() => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("theme", next);
    setTheme(next);
  }, [theme]);

  const closePanel = useCallback(() => update({ segment: "" }), [update]);

  // ── Global keyboard map (DESIGN.md §5) ────────────────────────────────
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = isTypingTarget(document.activeElement);

      if (
        (event.key === "/" && !typing) ||
        ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k")
      ) {
        event.preventDefault();
        inputRef.current?.focus();
        return;
      }

      // Chord: "g" then "k" / "h" / "s" switches mode directly.
      if (!typing) {
        const pending = chord.current;
        chord.current = null;
        if (pending?.key === "g" && Date.now() - pending.at < CHORD_WINDOW_MS) {
          const nextMode = MODE_CHORD_KEYS[event.key.toLowerCase()];
          if (nextMode) {
            event.preventDefault();
            update({ mode: nextMode });
            return;
          }
        }
        if (event.key.toLowerCase() === "g" && !event.metaKey && !event.ctrlKey) {
          chord.current = { key: "g", at: Date.now() };
          return;
        }
      }

      // Escape: exactly one layer closes per press, innermost first.
      if (event.key === "Escape") {
        if (shortcutsOpen) return setShortcutsOpen(false);
        if (palettteOpen) return setPaletteOpen(false);
        if (filtersOpen) return setFiltersOpen(false);
        if (stateRef.current.segment) return closePanel();
        if (stateRef.current.query) return setQuery("");
        if (activeIndexRef.current >= 0) {
          setActiveIndex(-1);
          (document.activeElement as HTMLElement | null)?.blur?.();
        }
        return;
      }

      if (event.key === "ArrowLeft" && !typing && stateRef.current.segment) {
        closePanel();
        return;
      }

      if (typing) return;

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        moveActiveIndex(event.key === "ArrowDown" ? "down" : "up");
        return;
      }
      if (event.key === "Enter") {
        activateCard(event.metaKey || event.ctrlKey);
        return;
      }
      if (event.key.toLowerCase() === "c") {
        copyActiveCardLink();
        return;
      }
      if (event.key.toLowerCase() === "f") {
        setFiltersOpen(true);
        return;
      }
      if (event.key === "?") {
        setShortcutsOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    shortcutsOpen,
    palettteOpen,
    filtersOpen,
    closePanel,
    setQuery,
    update,
    moveActiveIndex,
    activateCard,
    copyActiveCardLink
  ]);

  const years = useMemo(() => {
    if (!manifest) return [];
    const counts = new Map<number, number>();
    for (const episode of manifest.episodes)
      counts.set(episode.year, (counts.get(episode.year) ?? 0) + episode.count);
    return [...counts.entries()]
      .map(([year, count]) => ({ year, count }))
      .sort((a, b) => b.year - a.year);
  }, [manifest]);

  const episodeFacets = useMemo(() => {
    if (!manifest) return [];
    return [...manifest.episodes]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((episode) => ({
        id: episode.id,
        number: episode.number,
        title: episode.title,
        year: episode.year,
        count: episode.count
      }));
  }, [manifest]);

  const filtersActiveCount =
    (state.year ? 1 : 0) + (state.episode ? 1 : 0) + (state.type !== "all" ? 1 : 0);
  const filterChips = useMemo(() => buildFilterChips(state, episodeFacets), [state, episodeFacets]);

  const didYouMean = useMemo(() => {
    if (!suggestions.length || !state.query) return null;
    const lastSpace = state.query.lastIndexOf(" ");
    const current = state.query.slice(lastSpace + 1).toLowerCase();
    const suggestion = suggestions[0];
    if (!suggestion || suggestion === current) return null;
    return `${state.query.slice(0, lastSpace + 1)}${suggestion}`;
  }, [suggestions, state.query]);

  const episodeCount = manifest?.episodes.length ?? 0;
  const questionCount = useMemo(
    () => (manifest ? manifest.episodes.reduce((sum, episode) => sum + episode.count, 0) : 0),
    [manifest]
  );
  const updated = useMemo(() => {
    if (!manifest?.episodes.length) return null;
    return monthYear(manifest.episodes.reduce((a, b) => (a.date > b.date ? a : b)).date);
  }, [manifest]);

  const transcriptEpisode: EpisodeMeta | null = useMemo(
    () => manifest?.episodes.find((episode) => episode.id === transcript?.episodeId) ?? null,
    [manifest, transcript]
  );

  const loadingIndex = status === "Loading index…";
  const answersOnly = state.type === "answer";
  const showSkeleton =
    inFlight && results.length === 0 && !!state.query && status !== "Ready" && !loadingIndex;

  const sharedHeaderProps = {
    query: state.query,
    onQueryChange: setQuery,
    mode: state.mode,
    onModeChange: (mode: SearchMode) => update({ mode }),
    suggestions,
    loadingIndex,
    semanticCached,
    downloadStripState: downloadStrip,
    theme,
    onToggleTheme: flipTheme,
    inputRef,
    onArrowIntoResults: moveActiveIndex,
    onEnterActiveCard: onEnterFromInput
  };

  return (
    <>
      {!activated ? (
        <HomeHero
          {...sharedHeaderProps}
          episodeCount={episodeCount}
          questionCount={questionCount}
          updated={updated}
        />
      ) : (
        <main id="main" className="mx-auto min-h-screen max-w-6xl px-0 pb-24">
          <SearchHeader
            {...sharedHeaderProps}
            filtersActiveCount={filtersActiveCount}
            onOpenFilters={() => setFiltersOpen(true)}
          />
          <div className="flex gap-8 px-5 pt-6 sm:px-8">
            <FilterRail state={state} years={years} episodes={episodeFacets} onChange={update} />
            <div className="min-w-0 flex-1">
              {state.query ? (
                <section aria-label={`Results for "${state.query}"`}>
                  <ResultsMeta
                    count={results.length}
                    latencyMs={latencyMs}
                    showRerankNotice={showRerankNotice}
                  />
                  <div aria-live="polite" className="sr-only">
                    {activeIndex >= 0 && results[activeIndex]
                      ? `${activeIndex + 1} of ${results.length}: ${results[activeIndex].questionText || results[activeIndex].answerText.slice(0, 60)}`
                      : ""}
                  </div>
                  {showSkeleton ? (
                    <SkeletonList />
                  ) : results.length ? (
                    <ResultsList
                      results={results}
                      terms={terms}
                      mode={state.mode}
                      answersOnly={answersOnly}
                      activeIndex={activeIndex}
                      navSeq={navSeq}
                      onActivate={setActiveIndex}
                      onOpenTranscript={openTranscript}
                    />
                  ) : status === "Ready" || !inFlight ? (
                    <NoResultsState
                      query={state.query}
                      mode={state.mode}
                      didYouMean={didYouMean}
                      filterChips={filterChips}
                      onRetryQuery={(query) => runQuery(query)}
                      onSetMode={(mode) => update({ mode })}
                      onRemoveChip={(key) => update({ [key]: key === "type" ? "all" : "" })}
                    />
                  ) : null}
                </section>
              ) : (
                <EmptyState
                  recents={recents}
                  onRerun={(entry) => runQuery(entry.query, entry.mode)}
                  onRemove={(entry) => setRecents(removeRecentSearch(entry.query, entry.mode))}
                  onSelectSample={(query) => runQuery(query)}
                />
              )}
            </div>
          </div>
        </main>
      )}

      <FilterSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        state={state}
        years={years}
        episodes={episodeFacets}
        onChange={update}
      />

      {state.segment && (
        <TranscriptPanel
          episode={transcriptEpisode}
          segments={transcript?.segments ?? []}
          loading={transcript?.loading ?? true}
          targetSegmentId={state.segment}
          terms={terms}
          pulseOnOpen={pulseOnOpen}
          paletteOpen={palettteOpen}
          onPaletteOpenChange={setPaletteOpen}
          onClose={closePanel}
        />
      )}

      {shortcutsOpen && <ShortcutsOverlay onClose={() => setShortcutsOpen(false)} />}
    </>
  );
}
