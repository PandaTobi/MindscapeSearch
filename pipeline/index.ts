import { join } from "node:path";
import { cleanOutput, outputDir, sha256, stableJson, writeJson } from "./lib/content";
import { validate } from "./validate";

type Record = {
  segmentId: string;
  type: string;
  questionText: string;
  answerText: string;
  startSec: number | null;
  endSec: number | null;
  order: number;
  tokens: number;
  episode: {
    id: string;
    number: number;
    title: string;
    date: string;
    year: number;
    youtubeId: string | null;
    audioUrl: string;
  };
};

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
        episode: {
          id: episode.episodeId,
          number: episode.number,
          title: episode.title,
          date: episode.publishDate,
          year,
          youtubeId: episode.youtubeId,
          audioUrl: episode.audioUrl
        }
      }))
    );
    recordsByYear.set(year, records);
  }
  const shards: Array<{
    kind: "docs" | "keyword" | "vectors";
    key: string;
    url: string;
    bytes: number;
    sha256: string;
  }> = [];
  for (const [year, records] of [...recordsByYear.entries()].sort(([a], [b]) => a - b)) {
    const payload = stableJson({ records });
    const hash = sha256(payload).slice(0, 12);
    const relative = `docs/${year}.${hash}.json`;
    await writeJson(join(outputDir, relative), { records });
    shards.push({
      kind: "docs",
      key: String(year),
      url: `./${relative}`,
      bytes: Buffer.byteLength(payload),
      sha256: sha256(payload)
    });
  }
  const manifest = {
    schemaVersion: 1,
    buildId: sha256(stableJson(episodes.map((episode) => episode.contentHash))).slice(0, 16),
    model: { id: "all-MiniLM-L6-v2", dimension: 384, quantization: "int8" as const },
    episodes: episodes.map((episode) => ({
      id: episode.episodeId,
      number: episode.number,
      title: episode.title,
      date: episode.publishDate,
      year: Number(episode.publishDate.slice(0, 4)),
      youtubeId: episode.youtubeId,
      audioUrl: episode.audioUrl,
      count: episode.segments.length
    })),
    facets: {
      years: [...recordsByYear.keys()].sort((a, b) => b - a),
      types: ["question", "answer", "intro", "other"]
    },
    shards
  };
  await writeJson(join(outputDir, "manifest.json"), manifest);
  console.log(`Built ${episodes.length} episodes, ${shards.length} document shards.`);
}

main();
