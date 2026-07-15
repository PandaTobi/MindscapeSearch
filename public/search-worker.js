let manifest;
let episodeById = new Map(); // id → episode meta, built at init (see onmessage)
const keywordShards = new Map();
const docsShards = new Map();
const vectorShards = new Map();
let vocab = null; // { dim, index: Map<word,id>, idf: Float32Array, data: Int8Array }
// Length-preserving (no whitespace collapsing/trimming) so character offsets
// found in the normalized string line up 1:1 with the original text — required
// for highlight ranges to land on the right characters. NFD (canonical
// decomposition only), not NFKD: NFKD is a *compatibility* decomposition that
// also expands things like "…" into three literal periods, which silently
// breaks the length-parity this function exists to guarantee.
const normalize = (value) =>
  value
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, " ");
const tokenizeTerms = (value) => normalize(value).trim().split(/\s+/).filter(Boolean);
// Must mirror pipeline/embed tokenize() so query and corpus share a vector space.
const tokenizeSemantic = (value) =>
  normalize(value)
    .split(/\s+/)
    .filter((token) => token.length > 1 && token.length < 24);
const distance = (a, b) => {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 0; i < a.length; i++) {
    let previous = i;
    row[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const current = row[j + 1];
      row[j + 1] = Math.min(row[j + 1] + 1, row[j] + 1, previous + (a[i] === b[j] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
};
const fuzzy = (term, candidate) =>
  term.length > 3 && candidate.length <= term.length + 2 && distance(term, candidate) <= (term.length > 7 ? 2 : 1);
const dataBase = new URL("data/manifest.json", self.location.href);
const shardUrl = (shard) => new URL(shard.url, dataBase);
const fetchShard = async (kind, key) => {
  const shard = manifest.shards.find((item) => item.kind === kind && item.key === key);
  if (!shard) return null;
  if (shard.compressedUrl && "DecompressionStream" in self) {
    const compressed = await fetch(new URL(shard.compressedUrl, dataBase));
    if (compressed.ok) {
      const stream = compressed.body.pipeThrough(new DecompressionStream("gzip"));
      return new Response(stream).json();
    }
  }
  const response = await fetch(shardUrl(shard));
  return response.ok ? response.json() : Promise.reject(response.status);
};
async function keywordsFor(years) {
  await Promise.all(years.map(async (year) => {
    if (keywordShards.has(year)) return;
    const payload = await fetchShard("keyword", year);
    // Tag the cached payload with its shard key so keywordRank can build
    // globally-unique candidate ids ("year:recordId") — without it, records at
    // the same ordinal in different year shards collide. The postings Map is
    // built once here (not per query in keywordRank): rebuilding it from the
    // serialized `t` array on every keystroke, across every loaded shard,
    // dominated query latency for the unfiltered (all-years) case.
    if (payload) keywordShards.set(year, { ...payload, key: year, postings: new Map(payload.t) });
  }));
  return years.map((year) => keywordShards.get(year)).filter(Boolean);
}
function decodeDocs(payload) {
  const decode = (tokens) => tokens.map((token) => typeof token === "number" ? payload.d[token] : token).join("");
  return payload.r.map(([segmentId, type, startSec, endSec, order, episodeId, question, answer]) => ({
    segmentId, type, startSec, endSec, order, episodeId, questionText: decode(question), answerText: decode(answer)
  }));
}
async function docsFor(years) {
  await Promise.all(years.map(async (year) => {
    if (!docsShards.has(year)) {
      const payload = await fetchShard("docs", year);
      docsShards.set(year, payload ? decodeDocs(payload) : []);
    }
  }));
  return years.flatMap((year) => docsShards.get(year) || []);
}

// ── Semantic layer: static word table + quantized passage vectors ───────────
function decodeInt8(base64) {
  const binary = atob(base64);
  const out = new Int8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = (binary.charCodeAt(i) << 24) >> 24;
  return out;
}
async function ensureVocab() {
  if (vocab) return vocab;
  const payload = await fetchShard("vocab", "words");
  if (!payload) return null;
  vocab = {
    dim: payload.dim,
    idf: payload.idf,
    data: decodeInt8(payload.data),
    index: new Map(payload.words.map((word, i) => [word, i]))
  };
  return vocab;
}
async function vectorsFor(years) {
  await Promise.all(years.map(async (year) => {
    if (vectorShards.has(year)) return;
    const payload = await fetchShard("vectors", year);
    vectorShards.set(
      year,
      payload ? { dim: payload.dim, seg: payload.seg, sec: payload.sec, off: payload.off, data: decodeInt8(payload.data), count: payload.seg.length } : null
    );
  }));
}
/** IDF-weighted mean-pool the query into an L2-normalized float vector. */
function embedQuery(query) {
  if (!vocab) return null;
  const out = new Float32Array(vocab.dim);
  let used = 0;
  for (const token of tokenizeSemantic(query)) {
    const wi = vocab.index.get(token);
    if (wi === undefined) continue;
    const weight = vocab.idf[wi];
    const base = wi * vocab.dim;
    for (let d = 0; d < vocab.dim; d++) out[d] += weight * (vocab.data[base + d] / 127);
    used += 1;
  }
  if (!used) return null;
  let norm = 0;
  for (let d = 0; d < vocab.dim; d++) norm += out[d] * out[d];
  norm = Math.sqrt(norm) || 1;
  for (let d = 0; d < vocab.dim; d++) out[d] /= norm;
  return out;
}
/** Brute-force cosine over loaded int8 passage vectors; best passage per segment. */
function semanticRank(queryVector, years, state) {
  const best = new Map();
  for (const year of years) {
    const shard = vectorShards.get(year);
    if (!shard) continue;
    const { dim, seg, sec, off, data, count } = shard;
    for (let i = 0; i < count; i++) {
      if (state.type === "question" && off[i] >= 0) continue;
      if (state.type === "answer" && off[i] < 0) continue;
      const segmentId = seg[i];
      const episodeId = segmentId.slice(0, segmentId.indexOf("#"));
      if (state.episode && episodeId !== state.episode) continue;
      let dot = 0;
      const base = i * dim;
      for (let d = 0; d < dim; d++) dot += queryVector[d] * data[base + d];
      dot /= 127;
      const prev = best.get(segmentId);
      if (!prev || dot > prev.score)
        best.set(segmentId, { segmentId, episodeId, startSec: sec[i], offset: off[i], score: dot });
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, 240);
}
/** Reciprocal Rank Fusion — robust, needs no score calibration between engines. */
function fuse(keywordRanked, semanticRanked, k = 60) {
  const scores = new Map();
  const meta = new Map();
  keywordRanked.forEach((record, rank) => {
    scores.set(record.segmentId, (scores.get(record.segmentId) || 0) + 1 / (k + rank + 1));
    meta.set(record.segmentId, { ...record });
  });
  semanticRanked.forEach((record, rank) => {
    scores.set(record.segmentId, (scores.get(record.segmentId) || 0) + 1 / (k + rank + 1));
    meta.set(record.segmentId, { ...meta.get(record.segmentId), ...record });
  });
  return [...scores]
    .map(([segmentId, score]) => ({ ...meta.get(segmentId), segmentId, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 200);
}

/** First-occurrence highlight ranges of each term inside `text` (post-normalization offsets line up 1:1 since normalize() never changes string length). */
function ranges(text, terms) {
  const normalized = normalize(text);
  const found = [];
  for (const term of terms) {
    const from = normalized.indexOf(term);
    if (from >= 0) found.push([from, from + term.length]);
  }
  return found;
}
/** Windowed preview around the earliest matched term — full transcript stays one click away via "expand". */
function snippetAround(text, terms, radius = 170) {
  if (!text) return "";
  const normalized = normalize(text);
  let center = -1;
  for (const term of terms) {
    const at = normalized.indexOf(term);
    if (at >= 0 && (center < 0 || at < center)) center = at;
  }
  if (center < 0) {
    if (text.length <= radius * 2) return text;
    let end = radius * 2;
    while (end < text.length && /\S/.test(text[end])) end++;
    return `${text.slice(0, end).trimEnd()}…`;
  }
  let start = Math.max(0, center - radius);
  let end = Math.min(text.length, center + radius);
  while (start > 0 && /\S/.test(text[start - 1])) start--;
  while (end < text.length && /\S/.test(text[end])) end++;
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}
function suggestions(shards, prefix) {
  if (!prefix) return [];
  return [...new Set(shards.flatMap((shard) => shard.a.filter((term) => term.startsWith(prefix))))].slice(0, 8);
}

/** Keyword + fuzzy BM-ish ranking over the loaded keyword shards. */
function keywordRank(shards, terms, state) {
  const candidates = new Map();
  for (const shard of shards) {
    const postingMap = shard.postings; // built once in keywordsFor
    for (const term of terms) {
      let matched = false;
      const exact = postingMap.get(term);
      if (exact) {
        matched = true;
        for (const [recordId, weight] of exact) candidates.set(`${shard.key}:${recordId}`, (candidates.get(`${shard.key}:${recordId}`) || 0) + weight * 10);
      } else {
        for (const [word, posting] of postingMap) {
          if (!fuzzy(term, word)) continue;
          matched = true;
          for (const [recordId, weight] of posting) candidates.set(`${shard.key}:${recordId}`, (candidates.get(`${shard.key}:${recordId}`) || 0) + weight);
        }
      }
      if (!matched) candidates.set(`missing:${term}`, -Infinity);
    }
    if (!terms.length) shard.r.forEach((_, recordId) => candidates.set(`${shard.key}:${recordId}`, 0));
  }
  return [...candidates]
    .filter(([key, score]) => !key.startsWith("missing:") && Number.isFinite(score))
    .map(([key, score]) => {
      const [shardKey, recordId] = key.split(":");
      const shard = keywordShards.get(shardKey);
      const [segmentId, recordType, startSec, endSec, order, episodeId] = shard.r[Number(recordId)];
      return { segmentId, type: recordType, startSec, endSec, order, episodeId, score };
    })
    .filter((record) => (!state.type || state.type === "all" || record.type === state.type) && (!state.episode || record.episodeId === state.episode))
    .sort((left, right) => right.score - left.score || right.startSec - left.startSec)
    .slice(0, 240);
}

/** Resolve ranked (segmentId, score, …) records into displayable result cards. */
async function buildResults(ranked, terms) {
  const selectedYears = [...new Set(ranked.map((record) => String(episodeById.get(record.episodeId)?.year)))].filter(Boolean);
  const documents = new Map((await docsFor(selectedYears)).map((record) => [record.segmentId, record]));
  return ranked.flatMap((record) => {
    const document = documents.get(record.segmentId);
    const episodeMeta = episodeById.get(record.episodeId);
    if (!document || !episodeMeta) return [];
    // Semantic hits carry a passage offset → window the preview around that
    // passage. Keyword hits window around the earliest matched term. Both
    // fall back to the answer's head when there's nothing to center on.
    const isSemanticPassage = record.offset !== undefined && record.offset >= 0;
    const source = document.answerText || document.questionText;
    const preview = isSemanticPassage
      ? snippetAround(source.slice(record.offset), terms, 200) || source.slice(record.offset, record.offset + 340)
      : snippetAround(source, terms);
    return [{
      ...document,
      startSec: record.startSec ?? document.startSec,
      episode: episodeMeta,
      score: record.score,
      match: preview,
      highlights: { question: ranges(document.questionText, terms), answer: ranges(preview, terms) }
    }];
  });
}

self.onmessage = async ({ data }) => {
  if (data.type === "init") {
    manifest = data.manifest;
    // O(1) episode lookups thereafter — buildResults resolves an episode per
    // result, and this was previously a linear scan of manifest.episodes.
    episodeById = new Map(manifest.episodes.map((episode) => [episode.id, episode]));
    self.postMessage({ type: "ready" });
    return;
  }
  if (data.type === "episode") {
    const { id, episodeId } = data;
    const meta = episodeById.get(episodeId);
    const docs = meta ? await docsFor([String(meta.year)]) : [];
    const segments = docs
      .filter((doc) => doc.episodeId === episodeId)
      .sort((a, b) => a.order - b.order);
    self.postMessage({ id, type: "episode", episodeId, segments });
    return;
  }
  if (data.type !== "search" || !manifest) return;
  const { id, state } = data;
  const { query = "", year, mode = "keyword" } = state;
  const terms = tokenizeTerms(query);
  const years = year ? [year] : manifest.facets.years.map(String);
  const keyShards = await keywordsFor(years);
  const wantsSemantic = (mode === "semantic" || mode === "hybrid") && terms.length > 0;
  const suggestionList = suggestions(keyShards, terms.at(-1) || "");

  if (!wantsSemantic) {
    const ranked = keywordRank(keyShards, terms, state).slice(0, 200);
    self.postMessage({ id, type: "results", results: await buildResults(ranked, terms), terms, suggestions: suggestionList });
    return;
  }

  const cold = !vocab || years.some((y) => !vectorShards.has(y));
  // Keyword search never waits on the semantic model: on a cold load, render
  // the instant keyword pass immediately, then patch in the fused ranking once
  // the (~2 MB, cached-after-first-use) static embedding table has streamed in.
  if (cold && mode === "hybrid") {
    const keywordOnly = keywordRank(keyShards, terms, state).slice(0, 200);
    self.postMessage({
      id,
      type: "results",
      results: await buildResults(keywordOnly, terms),
      terms,
      suggestions: suggestionList,
      partial: true
    });
  } else if (cold) {
    self.postMessage({ id, type: "status", text: "Loading semantic model…" });
  }

  await ensureVocab();
  await vectorsFor(years);
  const queryVector = embedQuery(query);
  const semantic = queryVector ? semanticRank(queryVector, years, state) : [];
  const ranked = (mode === "semantic" ? semantic : fuse(keywordRank(keyShards, terms, state), semantic)).slice(0, 200);
  self.postMessage({ id, type: "results", results: await buildResults(ranked, terms), terms, suggestions: suggestionList });
};
