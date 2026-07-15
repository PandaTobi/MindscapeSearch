import { describe, expect, it } from "vitest";
import {
  EMBED_CONFIG,
  embedTokens,
  nearestWords,
  quantizeInt8,
  segmentToPassages,
  tokenize,
  trainWordTable
} from "../pipeline/embed";

// A tiny two-topic corpus: astronomy vs. cooking. Words within a topic should
// end up closer than words across topics after distillation.
const CORPUS = [
  "the star and the moon shine in the night sky above the planet",
  "a bright star orbits the planet near the moon in the dark sky",
  "the planet and its moon drift across the sky past a distant star",
  "we bake the bread and cook the soup with salt in the kitchen",
  "she cooks soup and bakes bread adding salt to the warm kitchen",
  "salt makes the soup and the bread taste better in the kitchen"
];

describe("static embedding trainer", () => {
  // Tiny corpus: keep every word so the topic structure is learnable.
  EMBED_CONFIG.minWordFreq = 1;
  const table = trainWordTable(CORPUS);

  it("tokenizes consistently with the runtime worker", () => {
    expect(tokenize("Arrow-of-Time, entropy!")).toEqual(["arrow", "of", "time", "entropy"]);
  });

  it("learns a non-trivial vector space", () => {
    expect(table.dim).toBeGreaterThan(1);
    expect(table.words).toContain("star");
    expect(table.words).toContain("soup");
  });

  it("places same-topic words nearer than cross-topic words", () => {
    const cos = (a: string, b: string) => {
      const ia = table.index.get(a)!;
      const ib = table.index.get(b)!;
      let dot = 0;
      for (let d = 0; d < table.dim; d++)
        dot += table.vectors[ia * table.dim + d] * table.vectors[ib * table.dim + d];
      return dot;
    };
    expect(cos("star", "moon")).toBeGreaterThan(cos("star", "soup"));
    expect(cos("soup", "bread")).toBeGreaterThan(cos("soup", "planet"));
  });

  it("nearest neighbors stay within topic", () => {
    expect(nearestWords(table, "soup", 3)).not.toContain("star");
  });

  it("pools tokens into a normalized vector and ignores unknown words", () => {
    const vec = embedTokens(table, ["soup", "bread", "zzzznotaword"]);
    expect(vec).not.toBeNull();
    let norm = 0;
    for (const x of vec!) norm += x * x;
    expect(norm).toBeCloseTo(1, 4);
    expect(embedTokens(table, ["zzzznotaword"])).toBeNull();
  });

  it("quantizes an L2-normalized vector into int8 range", () => {
    const vec = embedTokens(table, ["star", "moon"])!;
    const q = quantizeInt8(vec);
    expect(q).toBeInstanceOf(Int8Array);
    expect(Math.max(...q)).toBeLessThanOrEqual(127);
    expect(Math.min(...q)).toBeGreaterThanOrEqual(-127);
  });

  it("splits a segment into a question passage plus capped answer passages", () => {
    const longAnswer = Array.from({ length: 900 }, (_, i) => `word${i}`).join(" ");
    const passages = segmentToPassages({
      segmentId: "ama-2024-01#q01",
      episodeId: "ama-2024-01",
      questionText: "What is entropy?",
      answerText: longAnswer,
      startSec: 42
    });
    expect(passages[0].offset).toBe(-1); // question first
    const answerPassages = passages.filter((p) => p.offset >= 0);
    expect(answerPassages.length).toBe(EMBED_CONFIG.maxAnswerChunks);
    expect(answerPassages.every((p) => p.startSec === 42)).toBe(true);
  });
});
