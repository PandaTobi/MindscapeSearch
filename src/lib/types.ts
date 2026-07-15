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
  kind: "docs" | "keyword" | "autocomplete" | "meta" | "vectors" | "vocab";
  key: string;
  url: string;
  compressedUrl?: string;
  bytes: number;
  compressedBytes?: number;
  sha256: string;
  vectorCount?: number;
}
export interface Manifest {
  schemaVersion: number;
  buildId: string;
  model: {
    id: string;
    family?: "static" | "transformer";
    dimension: number;
    quantization: "int8";
    window?: number;
  };
  episodes: EpisodeMeta[];
  facets: {
    years: number[];
    types: SegmentType[];
    episodes?: Array<{ id: string; number: number; title: string; year: number }>;
  };
  shards: Shard[];
}
export interface SearchResult extends Segment {
  episode: EpisodeMeta;
  score: number;
  match?: string;
  highlights?: { question: Array<[number, number]>; answer: Array<[number, number]> };
}
