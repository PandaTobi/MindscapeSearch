# Semantic Search Design — Static Distilled Embeddings

This document explains the semantic-search layer that satisfies the SPEC's hard
constraints: **no backend, no API, no cloud inference, no paid services** — every
byte of semantic search runs in the browser, offline, from static files on
GitHub Pages.

It documents a deliberate departure from the SPEC's placeholder recommendation
(MiniLM via `transformers.js`/ONNX). The rest of the SPEC — keyword-first
architecture, sharding, manifest, RRF fusion, worker topology — is unchanged.

---

## 1. The problem with shipping a neural encoder

A transformer sentence-encoder is the obvious way to get query embeddings in the
browser, and it works. But it is expensive in exactly the dimension the task asks
us to minimize — **download size** — because the *encoder itself* must reach the
user:

| Cost | MiniLM / `transformers.js` |
|---|---|
| Model weights (int8 ONNX) | ~23 MB |
| ONNX Runtime Web (WASM) | ~5 MB |
| First-query latency | 50–200 ms (WASM), tokenizer init |
| Build dependency | pull a ~100 MB PyTorch model in CI |

You pay ~28 MB and a WASM runtime **before the first semantic query returns**, and
every query then costs a WASM forward pass. For a keyword-first app where semantic
is an *opt-in enhancement*, that is a poor size/quality trade.

## 2. The chosen strategy: distill a static embedding from the corpus

Instead of shipping a model that *computes* embeddings, we ship a **lookup table**
of pre-computed word vectors and embed text as a weighted average. This is the
same idea as [Model2Vec](https://github.com/MinishLab/model2vec) ("potion" static
embeddings), except the table is **distilled from the AMA corpus itself** using
classical Latent Semantic Analysis, so there is **no external model at all**.

Pipeline (`pipeline/embed/index.ts`, build-time only, deterministic, no network):

1. **Tokenize** the whole corpus (question + answer text).
2. **Co-occurrence matrix** — count word pairs within a ±5 sliding window. This
   captures distributional meaning: words used in similar contexts (`entropy` and
   `microstates`, `black`/`hole`/`horizon`) get similar rows.
3. **PPMI weighting** — Positive Pointwise Mutual Information reweights raw counts
   so high-frequency function words ("the", "you know") collapse toward zero and
   informative co-occurrences stand out.
4. **Truncated SVD** — reduce the sparse symmetric PPMI matrix to `D` dimensions
   via randomized subspace iteration + a small dense Jacobi eigensolver. Word
   vector = `Uₖ · √Λₖ`, then L2-normalized. (The corpus yields ~204 significant
   dimensions; we keep them all.)
5. **Pooling** — a passage/query embeds as the **IDF-weighted mean** of its word
   vectors, L2-normalized. Rare, topical words dominate; stopwords contribute
   little. The *identical* function embeds the corpus at build time and the user's
   query at run time, so the vector spaces are guaranteed to match.
6. **int8 quantization** — vectors are L2-normalized (components in [−1, 1]), so a
   fixed scale of 127 quantizes each dimension to one byte with no per-shard
   parameters. Cosine similarity ≈ `int8·int8 / 127`.

### What the browser downloads

| Artifact | Purpose | Size (gzip) |
|---|---|---|
| `vocab/words` | word table (~11k words × 204-D int8) + IDF | **~1.9 MB** |
| `vectors/<year>` | passage vectors for that year (int8) | ~0.2–0.4 MB each |

A filtered search ("2024 only") downloads the word table once plus a single year
of vectors. The whole corpus is ~4 MB — versus ~28 MB for the transformer path —
with **no WASM runtime** and **sub-millisecond** query embedding (a lookup + mean).

## 3. Runtime flow (`public/search-worker.js`)

Semantic search stays off the main thread, in the existing search worker:

1. On first semantic/hybrid query, stream `vocab/words` (cached by the browser
   afterward via content-hashed URLs) and the relevant `vectors/<year>` shards.
   The worker posts a `"Loading semantic model…"` status while this happens.
2. **Embed the query** with the same tokenize → IDF-mean → L2-normalize logic.
3. **Rank** by brute-force cosine (integer int8 dot products) over the loaded
   passage vectors — ~14k vectors scored in a few milliseconds. Collapse multiple
   passage hits to the best passage per segment.
4. **Hybrid mode** fuses keyword and semantic result lists with **Reciprocal Rank
   Fusion** (`score = Σ 1/(60 + rank)`), which needs no score calibration between
   the two engines.
5. Resolve passages → segments → display docs; the passage's char offset drives
   the highlighted snippet, and its timestamp drives the deep link.

The two-tier model from the SPEC is preserved: **segments** for keyword/display,
**passages** (1 question + up to 3 answer chunks) for embeddings, so a semantic hit
lands near the relevant sentence in a 10-minute answer.

## 4. Tradeoffs — honest accounting

**What we gain**
- ~7× smaller download, no WASM/WebGPU runtime, instant query embedding.
- Fully self-contained & deterministic builds — no model to fetch, reproducible.
- Vocabulary is the corpus vocabulary, so the table is naturally compact and its
  neighbors are domain-tuned (physics/philosophy) rather than generic.

**What we give up**
- Static embeddings capture **topical/distributional** similarity, not deep
  compositional meaning. They cannot model word order or negation ("not a boson"
  ≈ "a boson"). A transformer would.
- Out-of-vocabulary query words (rare terms, brand-new coinages) are ignored in
  pooling. Keyword search (always on) covers exact-term recall, and hybrid RRF
  makes the two complementary — which is precisely why keyword-first + fusion is
  the right frame for this trade.
- Quality is bounded by corpus size. On a small corpus the SVD rank is limited;
  the AMA back-catalog (~4.5k segments, 2.2M words) is comfortably enough for the
  neighbor quality shown below.

Observed quality (built artifacts, conceptual queries with no keyword overlap):

```
"is there a god"            → Pascal's wager; fine-tuning argument for God's existence
"what happens after we die" → "life stops at death and there is no afterlife"; cryonics
"the arrow of time"         → entropy / arrow-of-time passages
"tiny particles ... matter" → dark matter particles; mass of a proton
```

## 5. Swapping the embedding backend

Everything above sits behind one interface: **a set of int8 vectors + a way to
embed a query string into the same space.** Upgrading is a build-time change only;
the shard format, worker ranking, RRF fusion, and UI are untouched:

- **Higher quality, larger download:** drop in Model2Vec's pre-distilled `potion`
  token table (same lookup+mean runtime, ~stronger general-domain vectors), or the
  full MiniLM/ONNX path — re-embed passages in `pipeline/embed`, bump
  `manifest.model`, done.
- **Smaller still:** lower `EMBED_CONFIG.dim`, raise `minWordFreq`, or add product
  quantization to the passage vectors.

`manifest.model` records `{ id, family, dimension, quantization, window }` so the
client and caches invalidate correctly when the space changes.

## 6. Key knobs

`pipeline/embed/index.ts` → `EMBED_CONFIG`:

| Knob | Default | Effect |
|---|---|---|
| `dim` | 256 (→ ~204 kept) | quality vs. table & vector size |
| `minWordFreq` | 5 | vocab size / download vs. rare-word recall |
| `window` | 5 | topical vs. syntactic co-occurrence |
| `answerChunkWords` / `maxAnswerChunks` | 220 / 3 | passage granularity vs. vector count |
