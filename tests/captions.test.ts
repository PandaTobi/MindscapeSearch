import { describe, expect, it } from "vitest";
import {
  alignQuestionToCaptions,
  answerStartAfterQuestion,
  captionTextBetween,
  parseJson3Captions
} from "../pipeline/ingest/captions";

describe("caption alignment", () => {
  it("parses json3 captions and aligns a submitted question to its spoken introduction", () => {
    const cues = parseJson3Captions(
      JSON.stringify({
        events: [
          { tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: "Welcome everyone." }] },
          {
            tStartMs: 10000,
            dDurationMs: 1000,
            segs: [{ utf8: "Ada Loveless asks, what is time and why does it have an arrow?" }]
          },
          { tStartMs: 15000, dDurationMs: 1000, segs: [{ utf8: "The arrow is thermodynamic." }] },
          { tStartMs: 30000, dDurationMs: 1000, segs: [{ utf8: "Bob writes, why now?" }] }
        ]
      })
    );
    const alignment = alignQuestionToCaptions(
      {
        questionText: "What is time, and why does it have an arrow?",
        speakerNames: ["Ada Lovelace"]
      },
      cues
    );
    expect(alignment).toMatchObject({ startSec: 10 });
    expect(answerStartAfterQuestion({ questionText: "What is time?" }, cues, 10)).toBe(15);
    expect(captionTextBetween(cues, 15, 30)).toBe("The arrow is thermodynamic.");
  });
});
