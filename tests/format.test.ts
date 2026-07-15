import { describe, expect, it } from "vitest";
import { mediaUrl, secondsToClock } from "../src/lib/format";

describe("timestamp helpers", () => {
  it("formats seconds consistently", () => {
    expect(secondsToClock(3723)).toBe("1:02:03");
  });
  it("uses a YouTube timestamp when available", () => {
    expect(mediaUrl("abc", "https://audio.example/a.mp3", 42)).toBe(
      "https://www.youtube.com/watch?v=abc&t=42s"
    );
  });
});
