import type { Manifest, Segment, SearchResult } from "./types";
import type { QueryState } from "./url-state";

/**
 * The message contract between the main thread and the search worker
 * (`public/search-worker.js`). The worker is authored in plain JS (it runs as
 * a raw static asset, not through the bundler), so these types are the
 * main-thread-side source of truth for that boundary — keep them in sync with
 * the worker by hand.
 */

// ── Main thread → worker ─────────────────────────────────────────────────
export type WorkerRequest =
  | { type: "init"; manifest: Manifest }
  | { type: "search"; state: QueryState; id: number }
  | { type: "episode"; episodeId: string; id: number };

// ── Worker → main thread ─────────────────────────────────────────────────
export type WorkerResponse =
  | { type: "ready" }
  | { type: "status"; id?: number; text: string }
  | {
      type: "results";
      id: number;
      results: SearchResult[];
      terms: string[];
      suggestions: string[];
      /** True for the instant keyword pass emitted before a hybrid re-rank. */
      partial?: boolean;
    }
  | { type: "episode"; id: number; episodeId: string; segments: Segment[] };
