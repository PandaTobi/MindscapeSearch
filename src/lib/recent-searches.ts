import type { SearchMode } from "./types";

export interface RecentSearch {
  query: string;
  mode: SearchMode;
  at: number;
}

const STORAGE_KEY = "mindscape:recent-searches";
const MAX_ENTRIES = 5;

function read(): RecentSearch[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(entries: RecentSearch[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage may be unavailable (private browsing, quota) — recents are a
    // convenience, not a correctness requirement, so fail silently.
  }
}

export function loadRecentSearches(): RecentSearch[] {
  return read();
}

/** Record a completed search, most-recent-first, deduped by (query, mode). */
export function pushRecentSearch(query: string, mode: SearchMode): RecentSearch[] {
  const trimmed = query.trim();
  if (!trimmed) return read();
  const next = [
    { query: trimmed, mode, at: Date.now() },
    ...read().filter((entry) => !(entry.query === trimmed && entry.mode === mode))
  ].slice(0, MAX_ENTRIES);
  write(next);
  return next;
}

export function removeRecentSearch(query: string, mode: SearchMode): RecentSearch[] {
  const next = read().filter((entry) => !(entry.query === query && entry.mode === mode));
  write(next);
  return next;
}
