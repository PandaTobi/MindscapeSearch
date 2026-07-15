import { gzipSync } from "node:zlib";
import { join } from "node:path";
import { cleanOutput, outputDir, sha256, stableJson, writeJson } from "./lib/content";
import { validate } from "./validate";
import {
  EMBED_CONFIG,
  embedTokens,
  nearestWords,
  quantizeInt8,
  segmentToPassages,
  tokenize,
  trainWordTable,
  type WordTable
} from "./embed";

type Record = {
  segmentId: string;
  type: string;
  questionText: string;
  answerText: string;
  startSec: number | null;
  endSec: number | null;
  order: number;
  episodeId: string;
};

const toBase64 = (bytes: Int8Array) =>
  Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");

/** The static word table the browser downloads to embed queries offline. */
function vocabShard(table: WordTable) {
  const flat = new Int8Array(table.words.length * table.dim);
  for (let i = 0; i < table.words.length; i++) flat.set(quantizeInt8(table.vectors.subarray(i * table.dim, i * table.dim + table.dim)), i * table.dim);
  return {
    v: 1,
    dim: table.dim,
    words: table.words,
    // IDF rounded to 3 decimals — plenty of precision for pooling weights.
    idf: table.idf.map((value) => Math.round(value * 1000) / 1000),
    data: toBase64(flat)
  };
}

/** Per-year passage vectors: parallel arrays + one packed int8 blob. */
function vectorShard(records: Record[], table: WordTable) {
  const seg: string[] = [];
  const sec: Array<number | null> = [];
  const off: number[] = [];
  const rows: Int8Array[] = [];
  for (const record of records) {
    for (const passage of segmentToPassages(record)) {
      const vector = embedTokens(table, tokenize(passage.text));
      if (!vector) continue;
      seg.push(passage.segmentId);
      sec.push(passage.startSec);
      off.push(passage.offset);
      rows.push(quantizeInt8(vector));
    }
  }
  const flat = new Int8Array(rows.length * table.dim);
  rows.forEach((row, i) => flat.set(row, i * table.dim));
  return { payload: { v: 1, dim: table.dim, seg, sec, off, data: toBase64(flat) }, count: rows.length };
}

const normalize = (value: string) =>
  value
    .toLocaleLowerCase("en-US")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const words = (value: string) => normalize(value).split(/\s+/).filter((word) => word.length > 1);
const shortKeys = (record: Record) => [
  record.segmentId,
  record.type,
  record.startSec,
  record.endSec,
  record.order,
  record.episodeId
];

/** A browser-decodable compact transcript payload.  The dictionary is per shard,
 * so only the transcript years used by a result need to be downloaded. */
function compressedDocs(records: Record[]) {
  const frequencies = new Map<string, number>();
  for (const record of records) {
    for (const word of `${record.questionText} ${record.answerText}`.match(/[\p{L}\p{N}]+|[^\p{L}\p{N}]+/gu) ?? []) {
      if (word.length >= 3) frequencies.set(word, (frequencies.get(word) ?? 0) + 1);
    }
  }
  const dictionary = [...frequencies]
    .filter(([, count]) => count > 2)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([word]) => word);
  const dictionaryIds = new Map(dictionary.map((word, index) => [word, index]));
  const encode = (text: string) =>
    (text.match(/[\p{L}\p{N}]+|[^\p{L}\p{N}]+/gu) ?? []).map((part) =>
      dictionaryIds.has(part) ? dictionaryIds.get(part) : part
    );
  return { v: 1, d: dictionary, r: records.map((record) => [...shortKeys(record), encode(record.questionText), encode(record.answerText)]) };
}

function keywordIndex(records: Record[]) {
  const postings = new Map<string, Map<number, number>>();
  const autocomplete = new Map<string, number>();
  records.forEach((record, recordId) => {
    const add = (text: string, boost: number) => {
      for (const word of words(text)) {
        const hit = postings.get(word) ?? new Map<number, number>();
        hit.set(recordId, (hit.get(recordId) ?? 0) + boost);
        postings.set(word, hit);
        autocomplete.set(word, (autocomplete.get(word) ?? 0) + 1);
      }
    };
    add(record.questionText, 4);
    add(record.answerText, 1);
  });
  const terms = [...postings.keys()].sort();
  return {
    v: 1,
    // [term, [[document ordinal, field-weighted term frequency], ...]]
    t: terms.map((term) => [term, [...postings.get(term)!.entries()]]),
    // a compact prefix dictionary, ordered by usefulness then alphabetically.
    a: [...autocomplete]
      .sort(([left, leftCount], [right, rightCount]) => rightCount - leftCount || left.localeCompare(right))
      .slice(0, 12000)
      .map(([term]) => term),
    // minimal record metadata: display text remains in docs shards.
    r: records.map((record) => shortKeys(record))
  };
}

async function writeArtifact(
  kind: "docs" | "keyword" | "autocomplete" | "meta" | "vocab" | "vectors",
  key: string,
  value: unknown
) {
  const payload = stableJson(value);
  const hash = sha256(payload).slice(0, 12);
  const relative = `${kind}/${key}.${hash}.json`;
  await writeJson(join(outputDir, relative), value);
  // GitHub Pages does not attach Content-Encoding to arbitrary sidecars. The
  // worker explicitly inflates this gzip payload, keeping the download small
  // without relying on host-specific compression rules.
  const compressed = gzipSync(Buffer.from(payload), { level: 6 });
  const compressedRelative = `${relative}.gz`;
  const compressedPath = join(outputDir, compressedRelative);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(compressedPath, compressed);
  return { kind, key, url: `./${relative}`, compressedUrl: `./${compressedRelative}`, bytes: Buffer.byteLength(payload), compressedBytes: compressed.length, sha256: sha256(payload) };
}

async function main() {
  const episodes = await validate();
  await cleanOutput();
  const recordsByYear = new Map<number, Record[]>();
  for (const episode of episodes) {
    const year = Number(episode.publishDate.slice(0, 4));
    const records = recordsByYear.get(year) ?? [];
    records.push(
      ...episode.segments.map((segment) => ({
        ...segment,
        episodeId: episode.episodeId
      }))
    );
    recordsByYear.set(year, records);
  }
  // Distill the static semantic word table from the whole corpus, then embed
  // every passage against it. Build- and query-time embedding share this table.
  const allRecords = [...recordsByYear.values()].flat();
  console.log(`Training static embeddings over ${allRecords.length} segments…`);
  const table = trainWordTable(allRecords.map((record) => `${record.questionText} ${record.answerText}`));
  console.log(`Learned ${table.words.length} word vectors at ${table.dim}-D.`);
  for (const seed of ["entropy", "consciousness", "quantum", "universe", "morality"]) {
    const neighbors = nearestWords(table, seed);
    if (neighbors.length) console.log(`  ${seed} → ${neighbors.join(", ")}`);
  }

  const shards = [] as Array<Awaited<ReturnType<typeof writeArtifact>> & { vectorCount?: number }>;
  let vectorCount = 0;
  for (const [year, records] of [...recordsByYear].sort(([a], [b]) => a - b)) {
    shards.push(await writeArtifact("keyword", String(year), keywordIndex(records)));
    shards.push(await writeArtifact("autocomplete", String(year), { v: 1, a: keywordIndex(records).a }));
    shards.push(await writeArtifact("docs", String(year), compressedDocs(records)));
    const vectors = vectorShard(records, table);
    vectorCount += vectors.count;
    shards.push({ ...(await writeArtifact("vectors", String(year), vectors.payload)), vectorCount: vectors.count });
  }
  shards.push(await writeArtifact("vocab", "words", vocabShard(table)));
  const episodeMeta = episodes.map((episode) => ({
    id: episode.episodeId,
    number: episode.number,
    title: episode.title,
    date: episode.publishDate,
    year: Number(episode.publishDate.slice(0, 4)),
    youtubeId: episode.youtubeId,
    audioUrl: episode.audioUrl,
    count: episode.segments.length
  }));
  const facets = {
    years: [...recordsByYear.keys()].sort((a, b) => b - a),
    types: ["question", "answer", "intro", "other"],
    episodes: episodeMeta.map(({ id, number, title, year }) => ({ id, number, title, year }))
  };
  shards.push(await writeArtifact("meta", "episodes", { v: 1, episodes: episodeMeta, facets }));
  const manifest = {
    schemaVersion: 3,
    buildId: sha256(stableJson(episodes.map((episode) => episode.contentHash))).slice(0, 16),
    model: {
      id: "corpus-lsa-ppmi-svd",
      family: "static" as const,
      dimension: table.dim,
      quantization: "int8" as const,
      window: EMBED_CONFIG.window
    },
    episodes: episodeMeta,
    facets,
    shards
  };
  await writeJson(join(outputDir, "manifest.json"), manifest);
  console.log(
    `Built ${episodes.length} episodes, ${shards.length} static index shards, ${vectorCount} passage vectors.`
  );
}

main();
