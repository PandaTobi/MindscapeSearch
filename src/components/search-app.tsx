"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mediaUrl, secondsToClock } from "@/lib/format";
import {
  defaultQueryState,
  readQueryState,
  writeQueryState,
  type QueryState
} from "@/lib/url-state";
import type { Manifest, SearchResult } from "@/lib/types";

const asset = (path: string) => `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${path}`;

function HighlightedText({ text, ranges = [] }: { text: string; ranges?: Array<[number, number]> }) {
  const merged = ranges
    .filter(([start, end]) => start >= 0 && end > start && end <= text.length)
    .sort(([left], [right]) => left - right)
    .reduce<Array<[number, number]>>((all, range) => {
      const last = all.at(-1);
      if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
      else all.push([...range]);
      return all;
    }, []);
  if (!merged.length) return <>{text}</>;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (cursor < start) nodes.push(text.slice(cursor, start));
    nodes.push(<mark key={`${start}-${end}`} className="rounded bg-[var(--accent)]/20 px-0.5 text-inherit">{text.slice(start, end)}</mark>);
    cursor = end;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return <>{nodes}</>;
}

/** Case/diacritic-insensitive first-occurrence ranges — mirrors the worker's
 * length-preserving `normalize`/`ranges()` so char offsets found here line up
 * with the original text, and the expanded full transcript highlights land on
 * the right characters. NFD (not NFKD — see the worker's comment) keeps
 * compatibility characters like "…" at their original length. */
function findRanges(text: string, terms: string[]): Array<[number, number]> {
  const normalized = text
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, " ");
  const found: Array<[number, number]> = [];
  for (const term of terms) {
    const from = normalized.indexOf(term);
    if (from >= 0) found.push([from, from + term.length]);
  }
  return found;
}

const MODES: QueryState["mode"][] = ["keyword", "hybrid", "semantic"];
const TYPES: QueryState["type"][] = ["all", "question", "answer"];
/** Elements where single-letter shortcuts (g/a) must not fire while typing. */
const isTypingTarget = (el: Element | null) =>
  !!el && (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || (el as HTMLElement).isContentEditable);

export function SearchApp() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [state, setState] = useState<QueryState>(defaultQueryState);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [terms, setTerms] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [status, setStatus] = useState("Loading index…");
  const [theme, setTheme] = useState("light");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const worker = useRef<Worker | null>(null);
  const queryId = useRef(0);
  const resultRefs = useRef<Array<HTMLLIElement | null>>([]);

  useEffect(() => {
    setState(readQueryState());
    setTheme(document.documentElement.dataset.theme ?? "light");
    fetch(asset("/data/manifest.json"))
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((m: Manifest) => {
        setManifest(m);
        worker.current = new Worker(asset("/search-worker.js"));
        worker.current.postMessage({ type: "init", manifest: m });
      })
      .catch(() => setStatus("The search index has not been built yet."));
    return () => worker.current?.terminate();
  }, []);
  useEffect(() => {
    if (!worker.current) return;
    const timer = window.setTimeout(() => {
      writeQueryState(state);
      // A monotonic id lets the worker's response be dropped if a newer query
      // has since been dispatched — otherwise a slow cold semantic load could
      // resolve after (and overwrite) a faster subsequent keyword result.
      const id = ++queryId.current;
      worker.current?.postMessage({ type: "search", state, id });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [state]);
  useEffect(() => {
    if (!worker.current) return;
    worker.current.onmessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === "ready") {
        setStatus("Ready");
        return;
      }
      if (message.id !== undefined && message.id !== queryId.current) return; // stale response
      if (message.type === "status") setStatus(message.text);
      if (message.type === "results") {
        setResults(message.results);
        setTerms(message.terms ?? []);
        setSuggestions(message.suggestions ?? []);
        setExpanded(new Set());
        setActiveIndex(message.results.length ? 0 : -1);
        const count = `${message.results.length} result${message.results.length === 1 ? "" : "s"}`;
        setStatus(message.partial ? `${count} · refining with meaning…` : count);
      }
    };
  }, [manifest]);
  const update = useCallback(
    (patch: Partial<QueryState>) => setState((v) => ({ ...v, ...patch })),
    []
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = isTypingTarget(document.activeElement);
      if ((e.key === "/" && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        document.getElementById("search")?.focus();
        return;
      }
      if (e.key === "Escape") {
        setState((v) => ({ ...v, query: "" }));
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (!results.length) return;
        e.preventDefault();
        setActiveIndex((i) => {
          const next = e.key === "ArrowDown" ? Math.min(i + 1, results.length - 1) : Math.max(i - 1, 0);
          resultRefs.current[next]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
          return next;
        });
        return;
      }
      if (e.key === "Enter" && activeIndex >= 0 && results[activeIndex]) {
        const result = results[activeIndex];
        e.preventDefault();
        window.open(mediaUrl(result.episode.youtubeId, result.episode.audioUrl, result.startSec), "_blank", "noopener,noreferrer");
        return;
      }
      if (typing) return;
      if (e.key.toLowerCase() === "g") update({ mode: MODES[(MODES.indexOf(state.mode) + 1) % MODES.length] });
      if (e.key.toLowerCase() === "a") update({ type: TYPES[(TYPES.indexOf(state.type) + 1) % TYPES.length] });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [results, activeIndex, state.mode, state.type, update]);
  const years = useMemo(() => manifest?.facets.years ?? [], [manifest]);
  const episodes = useMemo(() => manifest?.facets.episodes ?? [], [manifest]);
  const flipTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("theme", next);
    setTheme(next);
  };
  const toggleExpanded = (segmentId: string) =>
    setExpanded((set) => {
      const next = new Set(set);
      if (next.has(segmentId)) next.delete(segmentId);
      else next.add(segmentId);
      return next;
    });
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-5 py-8 sm:px-8">
      <header className="mb-14 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
            Mindscape
          </p>
          <h1 className="mt-1 text-xl font-semibold">AMA Search</h1>
        </div>
        <button
          onClick={flipTheme}
          className="rounded-md border border-[var(--line)] px-3 py-2 text-sm"
          aria-label="Toggle color theme"
        >
          {theme === "dark" ? "Light" : "Dark"}
        </button>
      </header>
      <section className="mx-auto max-w-3xl">
        <label className="sr-only" htmlFor="search">
          Search AMA transcripts
        </label>
        <input
          id="search"
          value={state.query}
          onChange={(e) => update({ query: e.target.value })}
          placeholder="Search questions and answers…"
          className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] px-5 py-4 text-lg outline-none ring-[var(--accent)] focus:ring-2"
          autoComplete="off"
          list="search-suggestions"
        />
        <datalist id="search-suggestions">
          {suggestions.map((suggestion) => <option key={suggestion} value={suggestion} />)}
        </datalist>
        <p className="mt-3 text-center text-xs text-[var(--muted)]">
          / or ⌘K search · ↑↓ navigate · ↵ open · g mode · a content · esc clear
        </p>
      </section>
      <div className="mt-10 grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="h-fit rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 lg:sticky lg:top-5">
          <label className="block text-sm font-medium">
            Mode
            <select
              value={state.mode}
              onChange={(e) => update({ mode: e.target.value as QueryState["mode"] })}
              className="mt-2 w-full rounded border border-[var(--line)] bg-transparent p-2"
            >
              <option value="keyword">Keyword</option>
              <option value="hybrid">Hybrid (keyword + meaning)</option>
              <option value="semantic">Search meaning</option>
            </select>
          </label>
          {state.mode !== "keyword" && (
            <p className="mt-2 text-xs text-[var(--muted)]">
              Meaning search loads a {manifest ? `${manifest.model.dimension}-D static` : "static"}{" "}
              embedding model (~2 MB, cached after first use) and runs fully in your browser.
            </p>
          )}
          <label className="mt-4 block text-sm font-medium">
            Year
            <select
              value={state.year}
              onChange={(e) => update({ year: e.target.value })}
              className="mt-2 w-full rounded border border-[var(--line)] bg-transparent p-2"
            >
              <option value="">All years</option>
              {years.map((year) => (
                <option key={year}>{year}</option>
              ))}
            </select>
          </label>
          <label className="mt-4 block text-sm font-medium">
            Content
            <select
              value={state.type}
              onChange={(e) => update({ type: e.target.value as QueryState["type"] })}
              className="mt-2 w-full rounded border border-[var(--line)] bg-transparent p-2"
            >
              <option value="all">Questions & answers</option>
              <option value="question">Questions only</option>
              <option value="answer">Answers only</option>
            </select>
          </label>
          <label className="mt-4 block text-sm font-medium">
            Episode
            <select
              value={state.episode}
              onChange={(e) => update({ episode: e.target.value })}
              className="mt-2 w-full rounded border border-[var(--line)] bg-transparent p-2"
            >
              <option value="">All episodes</option>
              {episodes.map((item) => (
                <option key={item.id} value={item.id}>
                  AMA {item.number} · {item.year}
                </option>
              ))}
            </select>
          </label>
        </aside>
        <section aria-live="polite">
          <p className="mb-4 text-sm text-[var(--muted)]">{status}</p>
          {results.length ? (
            <ol className="space-y-4">
              {results.map((result, index) => {
                const isExpanded = expanded.has(result.segmentId);
                const isTruncated = !!result.answerText && result.match !== result.answerText;
                const bodyText = isExpanded ? result.answerText : (result.match ?? result.answerText);
                const bodyRanges = isExpanded
                  ? findRanges(result.answerText, terms)
                  : result.highlights?.answer;
                return (
                  <li
                    key={result.segmentId}
                    ref={(el) => {
                      resultRefs.current[index] = el;
                    }}
                    className={`rounded-xl border bg-[var(--panel)] p-5 transition-shadow ${
                      index === activeIndex
                        ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/30"
                        : "border-[var(--line)]"
                    }`}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                      <span className="rounded bg-[var(--bg)] px-2 py-1 font-medium text-[var(--ink)]">
                        AMA {result.episode.number}
                      </span>
                      <span>
                        {new Date(`${result.episode.date}T00:00:00`).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short"
                        })}
                      </span>
                    </div>
                    {result.questionText && (
                      <h2 className="mt-3 text-base font-semibold">
                        <HighlightedText text={result.questionText} ranges={result.highlights?.question} />
                      </h2>
                    )}
                    <p className="mt-2 whitespace-pre-line leading-7 text-[var(--muted)]">
                      <HighlightedText text={bodyText} ranges={bodyRanges} />
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <a
                        className="text-sm font-medium text-[var(--accent)]"
                        href={mediaUrl(
                          result.episode.youtubeId,
                          result.episode.audioUrl,
                          result.startSec
                        )}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Play at {secondsToClock(result.startSec)}
                      </a>
                      <button
                        className="text-sm text-[var(--muted)]"
                        onClick={() =>
                          navigator.clipboard.writeText(
                            `${window.location.origin}${window.location.pathname}?e=${encodeURIComponent(result.episode.id)}&s=${encodeURIComponent(result.segmentId)}`
                          )
                        }
                      >
                        Copy link
                      </button>
                      {isTruncated && (
                        <button
                          className="text-sm text-[var(--muted)] underline decoration-dotted"
                          onClick={() => toggleExpanded(result.segmentId)}
                        >
                          {isExpanded ? "Show less" : "Show full answer"}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            status === "Ready" && (
              <div className="rounded-xl border border-dashed border-[var(--line)] p-12 text-center text-sm text-[var(--muted)]">
                {state.query ? "No matching passages." : "Enter a search to explore the archive."}
              </div>
            )
          )}
        </section>
      </div>
    </main>
  );
}
