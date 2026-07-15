export type SearchMode = "keyword" | "hybrid" | "semantic";
export type SegmentType = "question" | "answer" | "intro" | "other";

export interface Segment {
  segmentId: string;
  type: SegmentType;
  questionText: string;
  answerText: string;
  startSec: number | null;
  endSec: number | null;
  order: number;
  tokens: number;
}

export interface Episode {
  episodeId: string;
  number: number;
  title: string;
  publishDate: string;
  sourceUrl: string;
  audioUrl: string;
  youtubeId: string | null;
  durationSec: number;
  segments: Segment[];
  contentHash: string;
}

export interface EpisodeMeta {
  id: string;
  number: number;
  title: string;
  date: string;
  year: number;
  youtubeId: string | null;
  audioUrl: string;
  count: number;
}

export interface Shard {
  kind: "docs" | "keyword" | "vectors";
  key: string;
  url: string;
  bytes: number;
  sha256: string;
  vectorCount?: number;
}
export interface Manifest {
  schemaVersion: number;
  buildId: string;
  model: { id: string; dimension: number; quantization: "int8" };
  episodes: EpisodeMeta[];
  facets: { years: number[]; types: SegmentType[] };
  shards: Shard[];
}
export interface SearchResult extends Segment {
  episode: EpisodeMeta;
  score: number;
  match?: string;
}
