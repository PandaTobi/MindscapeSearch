import { describe, expect, it } from "vitest";
import { validateEpisode } from "../pipeline/validate";

const episode = {
  episodeId: "ama-2024-01",
  number: 1,
  title: "Test",
  publishDate: "2024-01-01",
  sourceUrl: "https://example.com/source",
  audioUrl: "https://example.com/audio",
  youtubeId: null,
  durationSec: 100,
  contentHash: "a".repeat(64),
  segments: [
    {
      segmentId: "ama-2024-01#q01",
      type: "question" as const,
      questionText: "Why?",
      answerText: "Because.",
      startSec: 2,
      endSec: 5,
      order: 0,
      tokens: 2
    }
  ]
};

describe("canonical validation", () => {
  it("rejects backwards timestamps", () => {
    expect(() =>
      validateEpisode({
        ...episode,
        segments: [
          { ...episode.segments[0], startSec: 8, endSec: 9 },
          { ...episode.segments[0], segmentId: "ama-2024-01#q02", startSec: 3 }
        ]
      })
    ).toThrow("not monotonic");
  });
});
