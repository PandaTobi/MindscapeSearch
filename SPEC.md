# Mindscape AMA Search — Engineering Specification

A fully static, browser-only search application for Sean Carroll's Mindscape "Ask Me Anything" transcripts, deployable on GitHub Pages. This document is an implementation-ready design. No code, but concrete enough to build from.

---

## 1. Goals & Non-Goals

**Goal:** A single-page app that loads a pre-generated search index into the browser and provides instant keyword, fuzzy, and semantic search over AMA Q&A content, with deep links to audio/video timestamps.

**Hard constraints (all satisfied by this design):**
- No backend, database, server, search cluster, cloud service, or runtime API.
- All artifacts are static files served by GitHub Pages.
- All search — including semantic — executes in the user's browser.

**Design principles:**
1. **Keyword-first, semantic-as-enhancement.** The keyword engine is small and loads instantly. The semantic model is heavy (~20 MB) and loads lazily only when the user opts in. The app is fully usable before the semantic layer arrives.
2. **Build-time heavy, runtime light.** All parsing, embedding, and index construction happen in CI. The browser only *reads* pre-built artifacts.
3. **Shard and stream.** Never require the browser to download the entire corpus to answer a query.
4. **Deterministic, reproducible builds** so incremental updates are cheap and diffable.

---

## 2. High-Level Architecture

```
  SOURCES                 BUILD PIPELINE (CI only)            STATIC ARTIFACTS            BROWSER (runtime)
 ┌─────────┐   ingest    ┌──────────┐  parse   ┌──────────┐   ┌──────────────┐   fetch   ┌───────────────┐
 │ website │──────────▶  │ raw HTML │────────▶ │ canonical│──▶│ /data/*.json │──────────▶│ App shell     │
 │ RSS feed│             │ snapshots│          │ JSON     │   │ /index/*     │           │ Search engine │
 │ YouTube │             └──────────┘          │ (Q&A)    │   │ /vectors/*   │           │ Embedder(WASM)│
 └─────────┘                                   └────┬─────┘   │ manifest.json│           │ UI (dark/kbd) │
                                                    │         └──────────────┘           └───────────────┘
                                             build indexes:
                                             - keyword (Orama/FlexSearch)
                                             - embeddings (int8, sharded)
                                             - manifests
```

Two completely separate execution environments: **Node build pipeline** (runs in GitHub Actions) and **browser client** (static ES modules). They communicate only through versioned static files.

---

## 3. Repository Structure

```
mindscape-search/
├── .github/workflows/
│   ├── build-deploy.yml        # full build + Pages deploy
│   └── ingest-refresh.yml      # scheduled monthly incremental ingest
├── pipeline/                   # Node/TS build-time code (NOT shipped to browser)
│   ├── ingest/                 # source acquisition + caching
│   │   ├── fetch-episodes      # discover + download episode pages
│   │   ├── fetch-transcripts   # transcript acquisition
│   │   └── fetch-timestamps    # YouTube chapters / cue extraction
│   ├── parse/                  # HTML/transcript → canonical Q&A model
│   ├── normalize/              # cleaning, dedup, ID assignment
│   ├── index/                  # keyword index builder
│   ├── embed/                  # embedding generation + quantization
│   ├── shard/                  # sharding + manifest generation
│   └── validate/               # schema + integrity checks
├── raw-cache/                  # committed cache of source snapshots (content-hashed)
├── content/                    # canonical parsed JSON (committed, source of truth)
│   └── episodes/ama-XXX.json
├── public/                     # STATIC SITE ROOT (deployed to Pages)
│   ├── index.html
│   ├── assets/                 # app JS/CSS bundles
│   └── data/
│       ├── manifest.json       # index of shards, versions, checksums
│       ├── meta/               # episode metadata, filter facets
│       ├── keyword/            # serialized keyword index shards
│       ├── docs/               # displayable Q&A payload shards
│       └── vectors/            # quantized embedding shards + centroids
├── src/                        # browser client (TS)
│   ├── main.ts                 # bootstrap
│   ├── search/                 # engine orchestration (keyword/semantic/hybrid)
│   ├── loader/                 # shard loading, caching, memory budget
│   ├── ui/                     # components, routing, keyboard, theme
│   └── worker/                 # web workers: search worker + embed worker
├── tests/
└── package.json
```

**Key separation:** `pipeline/` and `src/` never share runtime code. `content/` is the committed, human-diffable source of truth; `public/data/` is generated and can be rebuilt from `content/` at any time.

---

## 4. Canonical Data Model

The parser normalizes every episode into a stable schema. This is the contract everything downstream depends on.

**Episode** (`content/episodes/ama-XXX.json`):

| field | type | notes |
|---|---|---|
| `episodeId` | string | stable slug, e.g. `ama-2024-06` |
| `number` | int | AMA sequence number |
| `title` | string | |
| `publishDate` | ISO date | drives year filter |
| `sourceUrl` | string | canonical episode page |
| `audioUrl` | string | direct audio, supports `#t=` |
| `youtubeId` | string \| null | for `?t=NNNs` deep links |
| `durationSec` | int | |
| `segments` | Segment[] | ordered Q&A units |
| `contentHash` | string | hash of normalized text, for incremental builds |

**Segment** (one Q&A unit — the atomic search/display record):

| field | type | notes |
|---|---|---|
| `segmentId` | string | `ama-2024-06#q07` — stable, used in URLs |
| `type` | enum | `question` \| `answer` \| `intro` \| `other` |
| `questionText` | string | patron question (empty for non-Q) |
| `answerText` | string | Sean's answer |
| `startSec` | int \| null | timestamp anchor |
| `endSec` | int \| null | |
| `order` | int | position within episode |
| `tokens` | int | length, for chunk budgeting |

**Passage** (embedding unit — derived, not authored): long answers are chunked into ~200–400 token overlapping passages so semantic hits land near the relevant sentence rather than the top of a 10-minute answer. Each passage carries `passageId`, parent `segmentId`, char offsets, and its own `startSec` estimate.

This two-tier model (Segment for display/keyword, Passage for embeddings) is the crux of good semantic UX in a long-form Q&A corpus.

---

## 5. Ingestion Pipeline

Runs only in CI (or locally by a maintainer). Idempotent and cached.

### 5.1 Source acquisition
1. **Episode discovery.** Parse the podcast RSS feed and/or the `/podcast/` archive pages to enumerate AMA episodes (filter titles matching the AMA pattern). RSS is preferred — it is stable, machine-readable, and gives dates, audio enclosure URLs, and descriptions.
2. **Transcript acquisition.** In priority order, with fallback:
   - Official transcript on the episode page (parse HTML).
   - Transcript file if linked.
   - **Fallback:** YouTube auto-captions / transcript for the episode's video (via the timed-text track). Captions are lower quality but timestamp-rich.
3. **Timestamp source.** YouTube chapter markers (in the video description) typically list each AMA question with its timestamp — this is the highest-value timestamp source. Extract chapters → map to segments during parsing.
4. **Politeness & caching.** All fetches are rate-limited, `User-Agent`-identified, and written to `raw-cache/` keyed by content hash. Builds prefer cache; only new/changed episodes hit the network. Respect `robots.txt`.

> **Open dependency / risk:** transcript availability and structure on the source site is the single biggest unknown. The parser must be built defensively with a pluggable per-source adapter interface, because the AMA HTML format has changed over the years. See §16.

### 5.2 Parser (transcript → segments)
The parser is a set of **source adapters** (one per transcript format era) behind a common interface, chosen per-episode by structural detection.

Parsing steps:
1. **Boundary detection.** Split the transcript into Q&A units. AMA transcripts typically mark questions distinctly (patron name + question, often bold/blockquote, or a "Q:"/name prefix). Use structural HTML cues first, then a heuristic classifier (line starts with a name pattern, ends in `?`, is short relative to following text) as fallback.
2. **Role tagging.** Assign `type = question | answer`. Text before the first question → `intro`.
3. **Timestamp binding.** Align each question boundary to the nearest YouTube chapter marker or caption cue by fuzzy text match on the question's opening words. Interpolate `startSec` for answers between adjacent question timestamps when explicit cues are absent.
4. **Cleaning/normalization.** Strip boilerplate, sponsor reads, HTML artifacts; normalize whitespace, unicode (NFC), smart quotes; preserve paragraph structure for display.
5. **Passage chunking.** Split answers into overlapping passages (sentence-aware, ~300 tokens, ~15% overlap) for embedding.
6. **ID assignment & hashing.** Deterministic IDs from `(episodeId, order)`. Compute per-segment and per-episode content hashes.

**Validation gate:** the `validate/` step enforces the schema, checks monotonic timestamps, flags episodes with zero questions or suspicious Q/A ratios, and fails the build on integrity errors. This prevents a source format change from silently corrupting the index.

---

## 6. Index Build Pipeline

From canonical `content/` JSON, build all runtime artifacts.

### 6.1 Keyword / full-text index
**Recommended engine: Orama** (client-side, supports full-text **and** vector **and** hybrid search in one index, with a serialization plugin so the index is *built in Node and restored in the browser* — no client-side indexing cost). FlexSearch or MiniSearch are acceptable alternatives for keyword-only, but Orama's native hybrid support directly serves the "semantic + static" requirement and reduces moving parts.

Index configuration:
- **Fields:** `questionText`, `answerText`, `title` (separate fields so "questions only" / "answers only" is a field-scoped query, and per-field boosting is possible).
- **Tokenizer:** English stemming + stop-word list tuned for physics vocabulary (do **not** stem key terms like "entropy", "boson"; maintain a keep-list).
- **Stored attributes:** minimal — store only `segmentId` + facet fields in the search index; the *displayable* text lives in separate `docs/` shards fetched on demand. This keeps the searchable index small in memory.
- **Facets:** `episodeId`, `publishYear`, `type` for fast filtering.

The index is built in Node, serialized via the persistence plugin, sharded (§6.3), and gzipped.

### 6.2 Semantic embeddings
- **Model:** a small sentence-embedding model with a browser-runnable ONNX build, e.g. **`all-MiniLM-L6-v2`** or **`bge-small-en-v1.5`** / **`gte-small`** (all 384-dim). Choose one and pin it; the *same* model must run at build time (Node) and query time (browser) so vector spaces match.
- **What gets embedded:** each **passage** (for answers) and each **question** independently. Questions and answers get separate vector namespaces so "semantic question search" and "semantic answer search" are distinct.
- **Normalization:** L2-normalize all vectors → cosine similarity reduces to a dot product.
- **Quantization:** scalar **int8** quantization per dimension (store `scale`/`zero-point` per shard, or global min/max). 384 dims → **384 bytes/vector**. This is the dominant size lever.
- **Optional coarse index (IVF):** k-means cluster all vectors into ~√N centroids; store each vector's centroid id. At query time, search only the nearest few centroids' vectors. Needed only if the corpus grows past a brute-force-comfortable size (see §11). Ship centroids in the manifest.

### 6.3 Sharding & manifest
- **Shard by episode-group** (e.g. one shard per year, or fixed-size buckets) for all three artifact families: `keyword/`, `docs/`, `vectors/`. Rationale: episode/year filters map cleanly to "load only these shards," and infinite scroll pages naturally along shard boundaries.
- **`manifest.json`** is the single entry point the client reads first:

| field | purpose |
|---|---|
| `schemaVersion`, `buildId` | cache-busting + compatibility gate |
| `model` | embedding model id + dim + quantization params |
| `episodes[]` | id, number, title, date, year, youtubeId, counts |
| `facets` | year list, episode list (for filter UI without loading shards) |
| `shards[]` | per shard: kind, byte size, vector count, url, sha256 |
| `centroids` | optional IVF centroids (quantized) |

Everything is content-addressed (hash in filename or query string) so shards cache forever and only changed shards get re-fetched on update.

---

## 7. Semantic Search Strategy (fully static)

The mechanism that makes semantic search work with no server:

1. **Build time:** every passage/question is embedded and quantized into static `vectors/` shards.
2. **Query time, in browser:**
   - Load the ONNX embedding model via **`transformers.js` on ONNX Runtime Web (WASM/WebGPU)** inside a **dedicated web worker**. Model weights (~20–25 MB q8) are cached in the Cache API / IndexedDB after first load.
   - Embed the user's query string → 384-dim vector, L2-normalized, quantized to match the corpus.
   - **Similarity search:** dequantize on the fly (or compute int8 dot products directly) and compute cosine similarity against candidate vectors. Brute force over loaded shards, or IVF-restricted if enabled.
   - Return top-K passages → resolve to parent segments → fetch display docs.

**Progressive enhancement contract:** semantic search is *opt-in* (a toggle / a "Search meaning" mode). Keyword search never waits on the model. First time semantic mode is engaged, show a one-time "downloading semantic model (~23 MB, cached after this)" indicator. WebGPU is used when available with WASM fallback.

**Hybrid mode (default power mode):** run keyword and semantic in parallel and fuse with **Reciprocal Rank Fusion (RRF)** — `score = Σ 1/(k + rank_i)` across the two result lists. RRF is robust, needs no score calibration between engines, and is cheap. This gives Perplexity-like "understands intent but respects exact terms" behavior.

---

## 8. Client Application

### 8.1 Runtime topology
- **Main thread:** UI, routing, state.
- **Search worker:** holds the keyword index + loaded vector shards; runs keyword + similarity + fusion off the main thread so typing stays at 60 fps.
- **Embed worker:** hosts the ONNX model; only spun up on first semantic use.

### 8.2 Query flow
1. Debounced input (~120 ms) → dispatch to search worker.
2. Worker runs: keyword search (instant) → render first results.
3. If semantic/hybrid mode: embed worker returns query vector → similarity → RRF re-rank → patch results.
4. Filters (episode/year/type) applied as pre-filters (facet bitsets) before ranking.

### 8.3 Feature implementation map

| Capability | Mechanism |
|---|---|
| **Instant search** | keyword index resident in worker; debounced incremental queries; render as-you-type |
| **Fuzzy search** | edit-distance/typo tolerance in the keyword engine (Orama/MiniSearch fuzzy=1–2 by term length) |
| **Autocomplete** | prefix search over a compact term/question-title dictionary built at index time; top suggestions ranked by frequency + recency |
| **Questions-only / answers-only** | field-scoped query restricting to `questionText` or `answerText`; semantic side switches vector namespace |
| **Filter by episode** | facet pre-filter (episode bitset); UI populated from manifest facets |
| **Filter by year** | facet pre-filter on `publishYear` |
| **Highlighting** | keyword: term-offset highlighting from engine match positions; semantic: highlight the matched passage span within the parent answer |
| **Jump to timestamp** | build `youtube.com/watch?v=<id>&t=<startSec>s` or `audioUrl#t=<startSec>` per segment; render as play button |
| **Copy timestamp link** | copy a canonical deep link (app URL with `?e=…&s=…` + resolved media link) to clipboard |
| **Dark mode** | CSS custom properties + `prefers-color-scheme`, manual toggle persisted in `localStorage`, no flash-of-theme (inline pre-paint script) |
| **Responsive** | CSS grid/flex, container queries; mobile-first; results list virtualized |
| **Keyboard shortcuts** | `/` or `⌘K` focus search, `↑/↓` navigate results, `Enter` open, `Esc` clear, `g/a` toggle modes; command-palette pattern (Linear-style) |
| **URL-based search** | full query state in URL query params (`?q=…&mode=hybrid&year=2024&type=question&e=ama-2024-06`); shareable + back/forward via History API |
| **Infinite scrolling** | virtualized list + IntersectionObserver sentinel; lazily fetch next `docs/` shard / next ranked page; keyword results paginate from the in-memory ranked list, semantic from top-K expansion |

### 8.4 UI/UX direction
Linear/Vercel/Perplexity aesthetic: centered command-style search bar, generous whitespace, monochrome base with a single accent, subtle motion, keyboard-forward. Result card = episode badge + date + question (bold) + answer snippet with highlights + timestamp play control + copy-link. Sticky filter rail (collapses to a sheet on mobile). Fast, minimal, no layout shift.

---

## 9. Search Algorithms & Ranking

- **Keyword scoring:** BM25 (engine default) with per-field boosts (`title` > `questionText` > `answerText`) and a small **recency prior** (newer AMAs slightly boosted) as a tunable multiplier.
- **Fuzzy:** typo tolerance scaled by term length (no fuzz for ≤3 chars, distance 1 for 4–7, distance 2 for longer); prefix expansion for the final token to power autocomplete.
- **Semantic:** cosine top-K over int8 vectors; optional IVF `nprobe` tuning.
- **Fusion:** RRF with `k≈60`; expose a keyword↔semantic weight only if needed.
- **De-duplication:** collapse multiple passage hits from the same segment; show the best passage, indicate "N matches in this answer."
- **Snippet selection:** choose the window around the highest-scoring term/passage; expand/collapse to full answer.

---

## 10. Performance Considerations

- **Time-to-first-search:** ship app shell + manifest + first keyword shard(s); target interactive keyword search in < 1.5 s on broadband. Semantic model excluded from this budget by design.
- **Off-main-thread:** all indexing restore, search, and embedding in workers. Main thread only renders.
- **Restore, don't rebuild:** keyword index is deserialized (Orama persistence), never rebuilt in-browser.
- **Debounce + cancel:** stale queries are cancelled (query id / AbortController pattern in worker messaging).
- **Virtualized rendering:** only visible result cards are in the DOM.
- **Precompute facets:** filter counts come from the manifest, not from scanning documents.
- **WebGPU when available** for embedding; graceful WASM fallback.
- **HTTP caching:** content-hashed filenames → immutable long-lived caching; only the small `manifest.json` is revalidated.

## 11. Browser Memory Usage

- **Budget targets:** keyword index tens of MB max; vector working set bounded by loaded shards.
- **Vector footprint:** int8 → 384 B/vector. 20k vectors ≈ 7.5 MB; 50k ≈ 19 MB. Brute-force dot products over int8 typed arrays (`Int8Array`) at this scale run in tens of milliseconds — acceptable without ANN up to ~50–100k vectors. Beyond that, enable IVF to cap the scanned set.
- **Lazy shard loading with LRU eviction:** the loader keeps a memory budget (e.g. ≤ ~150 MB total); least-recently-used vector/doc shards are dropped when filters or scroll move elsewhere. Keyword index for the active filter set stays resident.
- **Typed arrays only** for vectors (contiguous `Int8Array`/`Float32Array`), no per-vector objects, to avoid GC pressure and pointer overhead.
- **Display docs are streamed:** full answer text is fetched per shard only as results scroll into view, never all at once.
- **Model memory:** the ONNX model dominates when semantic is active (~50–150 MB resident); keep it in the embed worker and allow teardown when semantic mode is disabled for a while.

## 12. Index Compression

- **Text:** gzip/brotli over JSON (GitHub Pages serves gzip; pre-compress where possible). Consider a compact binary/columnar layout for `docs/` if JSON overhead matters.
- **Vectors:** int8 scalar quantization (4× vs float32) is the primary lever; optional **product quantization** for a further 4–8× if the corpus grows large, at a small recall cost. Store quantization params in the manifest.
- **Keyword index:** rely on the engine's serialized form + gzip; shard so each transfer is small.
- **Shared dictionaries:** intern repeated strings (episode ids, speaker names) via manifest lookup tables rather than repeating them per record.
- **Deltas via content-hashing:** unchanged shards keep their hash → browsers and CDNs never re-download them after a monthly update.

---

## 13. Build Tooling & GitHub Actions

**Toolchain:** Node + TypeScript for the pipeline; a modern bundler (Vite) for the client; ESLint/Prettier; Vitest for unit tests; JSON-schema validation for the data contract.

### 13.1 `build-deploy.yml` (on push to `main` + manual dispatch)
1. Checkout (with `raw-cache/` and `content/` present).
2. Install deps; restore CI caches for `raw-cache/` and the embedding model.
3. `parse` + `normalize` from `content/` (or from `raw-cache/` if re-parsing).
4. `validate` — fail fast on schema/integrity errors.
5. `index` (keyword) + `embed` (vectors) + `shard` (+ manifest) → `public/data/`.
6. `vite build` the client → `public/assets/`.
7. Upload `public/` as the Pages artifact → deploy via `actions/deploy-pages`.

### 13.2 `ingest-refresh.yml` (scheduled monthly + manual dispatch)
1. Run `ingest` to discover new/changed episodes (RSS diff).
2. For changed episodes only: fetch → parse → write updated `content/episodes/*.json` and `raw-cache/`.
3. Open a **pull request** with the content changes (human review gate for parser correctness on new formats).
4. Merging the PR triggers `build-deploy.yml`.

**Why PR, not direct commit:** transcript formats drift; a review gate catches a broken parse before it ships. The heavy embedding step runs only on merge.

---

## 14. Update Workflow (Incremental)

- **Change detection** via `contentHash` per episode/segment: only new or edited episodes are re-parsed and re-embedded. Embedding is the expensive step — never recompute vectors for unchanged passages (cache vectors keyed by `passageId + textHash + modelId`).
- **Shard stability:** appending a new AMA touches only its year/group shard + the manifest, so returning users download kilobytes, not the whole corpus.
- **Model change = full rebuild:** changing the embedding model invalidates all vectors and bumps `manifest.model` + `schemaVersion`; the client detects the version bump and refetches. Treat model upgrades as deliberate, infrequent events.
- **Backfill:** initial build ingests the full AMA back-catalog; thereafter monthly incremental.

---

## 15. Deployment (GitHub Pages)

- Deploy `public/` via the official **GitHub Pages Actions** flow (`upload-pages-artifact` + `deploy-pages`) — no `gh-pages` branch needed.
- **SPA routing:** GitHub Pages has no rewrite rules; use **hash-free History API** with a `404.html` copy of `index.html` fallback, *or* keep state in query params on a single route (preferred here, since search state is already query-param based — avoids the 404 dance entirely).
- **Base path:** if hosted at `user.github.io/mindscape-search/`, configure the bundler `base` and make all asset/shard/manifest URLs relative to it.
- **Custom domain (optional):** `CNAME` file + DNS; enables cleaner deep links.
- **Headers caveat:** Pages doesn't let you set custom headers; rely on content-hashed immutable filenames for cache correctness and accept default gzip.

---

## 16. Risks & Open Questions

1. **Transcript availability/quality (highest risk).** Whether machine-readable transcripts exist per AMA, and how their HTML is structured, determines parser complexity. Mitigation: pluggable per-era source adapters; YouTube caption fallback; validation gate; PR-review update flow.
2. **Timestamp fidelity.** If per-question timestamps aren't published, they must be derived from YouTube chapters or caption alignment; some deep links may be approximate. Mitigation: store `startSec` confidence; degrade gracefully to episode-level links.
3. **Semantic model download weight (~20 MB).** Mitigation: opt-in, cached, keyword-first. Reconsider a smaller/distilled model if adoption metrics warrant.
4. **Corpus growth.** Brute-force vectors are fine at current scale; add IVF/PQ before ~50–100k vectors.
5. **Licensing/ToS.** Confirm permitted use of transcripts and captions for a derivative search site; include attribution and link back to source episodes. Respect `robots.txt` and rate limits during ingest.

---

## 17. Recommended Implementation Roadmap

1. **M1 — Data spine:** ingest 3–5 sample AMAs, build parser + canonical schema + validation. Manually verify Q/A/timestamp extraction.
2. **M2 — Keyword MVP:** Orama index, sharding, manifest, minimal UI with instant + fuzzy search, filters, URL state, dark mode. Deploy to Pages.
3. **M3 — UX polish:** autocomplete, highlighting, timestamp deep links + copy, keyboard shortcuts, infinite scroll, responsive.
4. **M4 — Semantic layer:** embed pipeline, quantized vector shards, in-browser embedder in a worker, hybrid RRF, questions/answers semantic modes.
5. **M5 — Full backfill + automation:** ingest full catalog, wire the monthly `ingest-refresh` PR workflow, add IVF/PQ if scale requires.

---

**Recommended stack summary:** TypeScript everywhere · Orama (hybrid keyword+vector, serialized in Node/restored in browser) · transformers.js + ONNX Runtime Web (WebGPU→WASM) for in-browser embeddings · MiniLM/BGE-small 384-dim int8 vectors · RRF fusion · web workers for search+embedding · Vite build · GitHub Actions build + monthly ingest-PR · GitHub Pages deploy.
