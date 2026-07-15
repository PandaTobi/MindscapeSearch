/**
 * Static, self-contained semantic embeddings for the AMA corpus.
 *
 * Strategy (see docs/SEMANTIC-SEARCH.md): rather than shipping a ~23 MB neural
 * sentence-encoder to the browser, we DISTILL a static word-embedding table from
 * the corpus itself using classical latent semantic analysis:
 *
 *   1. tokenize the corpus,
 *   2. build a sparse term co-occurrence matrix over a sliding window,
 *   3. weight it with Positive Pointwise Mutual Information (PPMI),
 *   4. reduce to `dim` dimensions via randomized truncated SVD,
 *   5. embed any passage/query as the IDF-weighted mean of its word vectors.
 *
 * The resulting word table (~1–2 MB gzip, int8) is the ONLY thing the browser
 * downloads to "run the model", and embedding a query is a lookup + mean — no
 * WASM, no GPU, sub-millisecond. Build and query time share this exact table, so
 * the vector spaces are guaranteed identical.
 *
 * Everything here runs in Node at build time only. No network, deterministic.
 */

// ── Tuning knobs (dominant levers for the quality/size trade-off) ───────────
export const EMBED_CONFIG = {
  dim: 256, // embedding dimensionality; lower = smaller download, less nuance
  minWordFreq: 5, // drop rarer words; they lack reliable distributional signal
  window: 5, // ± co-occurrence context radius
  oversample: 16, // randomized-SVD oversampling for accuracy
  powerIterations: 2, // subspace power iterations; more = sharper spectrum
  answerChunkWords: 220, // passage size for answers
  answerChunkOverlap: 30, // overlap so a matched sentence is never split away
  maxAnswerChunks: 3, // cap passages per answer to bound total vector count
  seed: 0x1234abcd // deterministic RNG seed for reproducible builds
};

// ── Deterministic RNG (mulberry32) + Gaussian sampler ───────────────────────
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gaussianFill(out: Float64Array, next: () => number) {
  for (let i = 0; i < out.length; i += 2) {
    const u = Math.max(next(), 1e-12);
    const v = next();
    const r = Math.sqrt(-2 * Math.log(u));
    out[i] = r * Math.cos(2 * Math.PI * v);
    if (i + 1 < out.length) out[i + 1] = r * Math.sin(2 * Math.PI * v);
  }
}

// ── Tokenizer — identical logic must live in the browser worker ─────────────
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 1 && token.length < 24);
}

// ── Sparse CSR matrix ───────────────────────────────────────────────────────
interface CSR {
  n: number;
  rowPtr: Int32Array;
  colIdx: Int32Array;
  val: Float64Array;
}

/** y = M · x, where x/y are (n × k) row-major dense blocks and M is symmetric. */
function spmm(M: CSR, x: Float64Array, k: number, y: Float64Array) {
  y.fill(0);
  for (let i = 0; i < M.n; i++) {
    const yo = i * k;
    for (let p = M.rowPtr[i]; p < M.rowPtr[i + 1]; p++) {
      const j = M.colIdx[p];
      const v = M.val[p];
      const xo = j * k;
      for (let c = 0; c < k; c++) y[yo + c] += v * x[xo + c];
    }
  }
}

/** In-place modified Gram–Schmidt orthonormalization of an (n × k) block. */
function orthonormalize(Q: Float64Array, n: number, k: number) {
  for (let c = 0; c < k; c++) {
    for (let d = 0; d < c; d++) {
      let dot = 0;
      for (let i = 0; i < n; i++) dot += Q[i * k + c] * Q[i * k + d];
      for (let i = 0; i < n; i++) Q[i * k + c] -= dot * Q[i * k + d];
    }
    let norm = 0;
    for (let i = 0; i < n; i++) norm += Q[i * k + c] * Q[i * k + c];
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < n; i++) Q[i * k + c] /= norm;
  }
}

/** Jacobi eigensolver for a small dense symmetric (k × k) matrix. */
function jacobiEigen(A: Float64Array, k: number) {
  const V = new Float64Array(k * k);
  for (let i = 0; i < k; i++) V[i * k + i] = 1;
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let p = 0; p < k; p++)
      for (let q = p + 1; q < k; q++) off += A[p * k + q] * A[p * k + q];
    if (off < 1e-12) break;
    for (let p = 0; p < k; p++) {
      for (let q = p + 1; q < k; q++) {
        const apq = A[p * k + q];
        if (Math.abs(apq) < 1e-15) continue;
        const app = A[p * k + p];
        const aqq = A[q * k + q];
        const phi = 0.5 * Math.atan2(2 * apq, aqq - app);
        const c = Math.cos(phi);
        const s = Math.sin(phi);
        for (let i = 0; i < k; i++) {
          const aip = A[i * k + p];
          const aiq = A[i * k + q];
          A[i * k + p] = c * aip - s * aiq;
          A[i * k + q] = s * aip + c * aiq;
        }
        for (let i = 0; i < k; i++) {
          const api = A[p * k + i];
          const aqi = A[q * k + i];
          A[p * k + i] = c * api - s * aqi;
          A[q * k + i] = s * api + c * aqi;
        }
        for (let i = 0; i < k; i++) {
          const vip = V[i * k + p];
          const viq = V[i * k + q];
          V[i * k + p] = c * vip - s * viq;
          V[i * k + q] = s * vip + c * viq;
        }
      }
    }
  }
  const eig = Array.from({ length: k }, (_, i) => ({ value: A[i * k + i], index: i }));
  return { eig, V };
}

export interface WordTable {
  dim: number;
  words: string[];
  idf: number[];
  /** L2-normalized word vectors, row-major (words.length × dim). */
  vectors: Float32Array;
  index: Map<string, number>;
}

/**
 * Learn the static word-embedding table from raw documents (one string per
 * segment: question + answer). Returns L2-normalized `dim`-D word vectors plus
 * per-word IDF used for pooling.
 */
export function trainWordTable(documents: string[]): WordTable {
  const cfg = EMBED_CONFIG;
  // 1) Vocabulary + document frequency (for IDF).
  const freq = new Map<string, number>();
  const df = new Map<string, number>();
  const tokenized = documents.map((doc) => {
    const tokens = tokenize(doc);
    const seen = new Set<string>();
    for (const token of tokens) {
      freq.set(token, (freq.get(token) ?? 0) + 1);
      if (!seen.has(token)) {
        seen.add(token);
        df.set(token, (df.get(token) ?? 0) + 1);
      }
    }
    return tokens;
  });
  const words = [...freq.entries()]
    .filter(([, count]) => count >= cfg.minWordFreq)
    .map(([word]) => word)
    .sort();
  const index = new Map(words.map((word, i) => [word, i]));
  const V = words.length;

  // 2) Sparse symmetric co-occurrence over a sliding window. Every in-vocab
  //    token acts as both center and context, so the matrix is symmetric and
  //    every word has a non-zero marginal (row sum). PPMI, below, corrects for
  //    raw frequency — high-frequency function words end up near zero.
  const cooc = Array.from({ length: V }, () => new Map<number, number>());
  const marginal = new Float64Array(V);
  let pairTotal = 0;
  for (const tokens of tokenized) {
    const ids = tokens.map((token) => index.get(token) ?? -1);
    for (let i = 0; i < ids.length; i++) {
      const wi = ids[i];
      if (wi < 0) continue;
      const hi = Math.min(ids.length - 1, i + cfg.window);
      for (let j = i + 1; j <= hi; j++) {
        const wj = ids[j];
        if (wj < 0 || wj === wi) continue;
        cooc[wi].set(wj, (cooc[wi].get(wj) ?? 0) + 1);
        cooc[wj].set(wi, (cooc[wj].get(wi) ?? 0) + 1);
        marginal[wi] += 1;
        marginal[wj] += 1;
        pairTotal += 2;
      }
    }
  }

  // 3) PPMI weighting: pmi = log( p(i,j) / (p(i) p(j)) ), clamped at 0.
  //    Assemble the result directly as a symmetric CSR matrix.
  const rowPtr = new Int32Array(V + 1);
  for (let i = 0; i < V; i++) rowPtr[i + 1] = rowPtr[i] + cooc[i].size;
  const nnz = rowPtr[V];
  const colIdx = new Int32Array(nnz);
  const val = new Float64Array(nnz);
  let cursor = 0;
  for (let i = 0; i < V; i++) {
    const pi = marginal[i] / pairTotal;
    for (const [j, count] of cooc[i]) {
      const pj = marginal[j] / pairTotal;
      const pij = count / pairTotal;
      const ppmi = Math.max(0, Math.log(pij / (pi * pj)));
      colIdx[cursor] = j;
      val[cursor] = ppmi;
      cursor += 1;
    }
    cooc[i].clear();
  }
  const M: CSR = { n: V, rowPtr, colIdx, val };

  // 4) Randomized eigendecomposition of the symmetric PPMI matrix.
  const k = Math.min(V, cfg.dim + cfg.oversample);
  const next = rng(cfg.seed);
  let Q = new Float64Array(V * k);
  gaussianFill(Q, next);
  let Y = new Float64Array(V * k);
  spmm(M, Q, k, Y);
  [Q, Y] = [Y, Q];
  orthonormalize(Q, V, k);
  for (let iter = 0; iter < cfg.powerIterations; iter++) {
    spmm(M, Q, k, Y);
    [Q, Y] = [Y, Q];
    orthonormalize(Q, V, k);
  }
  // T = Qᵀ M Q  (k × k, small & symmetric); MQ reuses Y.
  spmm(M, Q, k, Y);
  const T = new Float64Array(k * k);
  for (let a = 0; a < k; a++)
    for (let b = a; b < k; b++) {
      let dot = 0;
      for (let i = 0; i < V; i++) dot += Q[i * k + a] * Y[i * k + b];
      T[a * k + b] = dot;
      T[b * k + a] = dot;
    }
  const { eig, V: W } = jacobiEigen(T, k);
  if (process.env.DBG_EIGEN) {
    const sorted = [...eig].sort((x, y) => y.value - x.value).map((e) => Math.round(e.value * 100) / 100);
    console.error("eigvals top/bottom:", sorted.slice(0, 6), "…", sorted.slice(-3));
  }
  // Keep the top `dim` positive eigenpairs (largest magnitude eigenvalues).
  const top = eig
    .filter((e) => e.value > 1e-9)
    .sort((x, y) => y.value - x.value)
    .slice(0, cfg.dim);
  const dim = top.length;

  // Word vector = (Q · W)[:, top] scaled by sqrt(eigenvalue), then L2-normalized.
  const vectors = new Float32Array(V * dim);
  for (let i = 0; i < V; i++) {
    let norm = 0;
    for (let d = 0; d < dim; d++) {
      const { index: col, value } = top[d];
      let u = 0;
      for (let a = 0; a < k; a++) u += Q[i * k + a] * W[a * k + col];
      const comp = u * Math.sqrt(value);
      vectors[i * dim + d] = comp;
      norm += comp * comp;
    }
    norm = Math.sqrt(norm) || 1;
    for (let d = 0; d < dim; d++) vectors[i * dim + d] /= norm;
  }

  const N = documents.length;
  const idf = words.map((word) => Math.log(1 + N / (df.get(word) ?? 1)));
  return { dim, words, idf, vectors, index };
}

/**
 * IDF-weighted mean-pool a token list into a single L2-normalized vector.
 * Identical math runs in the browser to embed the user's query.
 */
export function embedTokens(table: WordTable, tokens: string[]): Float32Array | null {
  const out = new Float32Array(table.dim);
  let used = 0;
  for (const token of tokens) {
    const wi = table.index.get(token);
    if (wi === undefined) continue;
    const weight = table.idf[wi];
    const base = wi * table.dim;
    for (let d = 0; d < table.dim; d++) out[d] += weight * table.vectors[base + d];
    used += 1;
  }
  if (!used) return null;
  let norm = 0;
  for (let d = 0; d < table.dim; d++) norm += out[d] * out[d];
  norm = Math.sqrt(norm) || 1;
  for (let d = 0; d < table.dim; d++) out[d] /= norm;
  return out;
}

/** Symmetric int8 quantization of an L2-normalized (‖x‖≤1) vector, scale = 127. */
export function quantizeInt8(vec: Float32Array): Int8Array {
  const out = new Int8Array(vec.length);
  for (let i = 0; i < vec.length; i++) {
    const q = Math.round(vec[i] * 127);
    out[i] = q > 127 ? 127 : q < -127 ? -127 : q;
  }
  return out;
}

export interface Passage {
  segmentId: string;
  episodeId: string;
  startSec: number | null;
  /** char offset into answerText, or -1 when the passage is the question. */
  offset: number;
  text: string;
}

/** Split a segment into embeddable passages: 1 question + up to N answer chunks. */
export function segmentToPassages(segment: {
  segmentId: string;
  episodeId: string;
  questionText: string;
  answerText: string;
  startSec: number | null;
}): Passage[] {
  const passages: Passage[] = [];
  if (segment.questionText.trim())
    passages.push({
      segmentId: segment.segmentId,
      episodeId: segment.episodeId,
      startSec: segment.startSec,
      offset: -1,
      text: segment.questionText
    });
  const answer = segment.answerText ?? "";
  if (answer.trim()) {
    // Word ranges with char offsets so we can show the matched span later.
    const wordRe = /\S+/g;
    const spans: Array<{ start: number; end: number }> = [];
    let match: RegExpExecArray | null;
    while ((match = wordRe.exec(answer))) spans.push({ start: match.index, end: match.index + match[0].length });
    const { answerChunkWords: size, answerChunkOverlap: overlap, maxAnswerChunks: cap } = EMBED_CONFIG;
    for (let start = 0, chunks = 0; start < spans.length && chunks < cap; start += size - overlap, chunks++) {
      const slice = spans.slice(start, start + size);
      if (!slice.length) break;
      const from = slice[0].start;
      const to = slice[slice.length - 1].end;
      passages.push({
        segmentId: segment.segmentId,
        episodeId: segment.episodeId,
        startSec: segment.startSec,
        offset: from,
        text: answer.slice(from, to)
      });
      if (start + size >= spans.length) break;
    }
  }
  return passages;
}

/** Diagnostic: nearest neighbors of a seed word, for build-time sanity checks. */
export function nearestWords(table: WordTable, word: string, n = 8): string[] {
  const wi = table.index.get(word);
  if (wi === undefined) return [];
  const base = wi * table.dim;
  const scored = table.words.map((w, i) => {
    let dot = 0;
    for (let d = 0; d < table.dim; d++) dot += table.vectors[base + d] * table.vectors[i * table.dim + d];
    return { w, dot };
  });
  return scored
    .filter((s) => s.w !== word)
    .sort((a, b) => b.dot - a.dot)
    .slice(0, n)
    .map((s) => s.w);
}
