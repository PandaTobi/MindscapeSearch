"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mediaUrl, secondsToClock } from "@/lib/format";
import {
  defaultQueryState,
  readQueryState,
  writeQueryState,
  type QueryState
} from "@/lib/url-state";
import type { Manifest, SearchResult } from "@/lib/types";

const asset = (path: string) => `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${path}`;

export function SearchApp() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [state, setState] = useState<QueryState>(defaultQueryState);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [status, setStatus] = useState("Loading index…");
  const [theme, setTheme] = useState("light");
  const worker = useRef<Worker | null>(null);

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
      worker.current?.postMessage({ type: "search", state });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [state]);
  useEffect(() => {
    if (!worker.current) return;
    worker.current.onmessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === "ready") setStatus("Ready");
      if (message.type === "results") {
        setResults(message.results);
        setStatus(`${message.results.length} result${message.results.length === 1 ? "" : "s"}`);
      }
    };
  }, [manifest]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        (e.key === "/" && document.activeElement?.tagName !== "INPUT") ||
        ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")
      ) {
        e.preventDefault();
        document.getElementById("search")?.focus();
      }
      if (e.key === "Escape") setState((v) => ({ ...v, query: "" }));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const update = useCallback(
    (patch: Partial<QueryState>) => setState((v) => ({ ...v, ...patch })),
    []
  );
  const years = useMemo(() => manifest?.facets.years ?? [], [manifest]);
  const flipTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("theme", next);
    setTheme(next);
  };
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
        />
        <p className="mt-3 text-center text-xs text-[var(--muted)]">
          Press / or ⌘K to search · keyword search is available immediately
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
              <option value="hybrid" disabled>
                Hybrid (coming with model)
              </option>
              <option value="semantic" disabled>
                Search meaning (coming with model)
              </option>
            </select>
          </label>
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
        </aside>
        <section aria-live="polite">
          <p className="mb-4 text-sm text-[var(--muted)]">{status}</p>
          {results.length ? (
            <ol className="space-y-4">
              {results.map((result) => (
                <li
                  key={result.segmentId}
                  className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5"
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
                    <h2 className="mt-3 text-base font-semibold">{result.questionText}</h2>
                  )}
                  <p className="mt-2 whitespace-pre-line leading-7 text-[var(--muted)]">
                    {result.match ?? result.answerText}
                  </p>
                  <div className="mt-4 flex items-center gap-3">
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
                  </div>
                </li>
              ))}
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
