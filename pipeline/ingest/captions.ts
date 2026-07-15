import type { CanonicalSegment } from "../lib/schema";

export type CaptionCue = { startSec: number; endSec: number; text: string };

type Json3Caption = {
  events?: Array<{ tStartMs?: number; dDurationMs?: number; segs?: Array<{ utf8?: string }> }>;
};

const stopWords = new Set(
  "a an and are as at be been being but by can could did do does for from has have he her here him his how i if in into is it its me my no not of on or our she so that the their them then there these they this to up was we were what when where which who why will with would you your".split(
    " "
  )
);

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizedWords(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word));
}

function spokenWordCount(value: string) {
  return value
    .replace(/[^\p{L}\p{N}'’]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

/** Parses yt-dlp's timed-text json3 representation without retaining display-only events. */
export function parseJson3Captions(source: string): CaptionCue[] {
  const json = JSON.parse(source) as Json3Caption;
  return (json.events ?? [])
    .flatMap((event) => {
      const text = cleanText((event.segs ?? []).map((segment) => segment.utf8 ?? "").join(" "));
      if (!text || event.tStartMs === undefined) return [];
      const startSec = event.tStartMs / 1000;
      return [{ startSec, endSec: startSec + (event.dDurationMs ?? 0) / 1000, text }];
    })
    .sort((a, b) => a.startSec - b.startSec);
}

function overlapScore(question: string, text: string) {
  const words = [...new Set(normalizedWords(question))];
  if (!words.length) return 0;
  const normalized = text.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  const covered = words.filter((word) => normalized.includes(word));
  return covered.length / words.length;
}

function editDistance(left: string, right: string) {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let previous = row[0];
    row[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const saved = row[rightIndex];
      row[rightIndex] = Math.min(
        row[rightIndex] + 1,
        row[rightIndex - 1] + 1,
        previous + Number(left[leftIndex - 1] !== right[rightIndex - 1])
      );
      previous = saved;
    }
  }
  return row[right.length];
}

function speakerScore(speakers: string[], text: string) {
  const captionWords = normalizedWords(text);
  return Math.max(
    0,
    ...speakers.map((speaker) => {
      const words = normalizedWords(speaker);
      if (!words.length) return 0;
      const matched = words.filter((word) =>
        captionWords.some(
          (caption) =>
            caption === word ||
            caption.startsWith(word.slice(0, 4)) ||
            (word.length >= 5 &&
              editDistance(word, caption) <= Math.max(1, Math.floor(word.length / 4)))
        )
      );
      return matched.length / words.length;
    })
  );
}

export type CaptionAlignment = { startSec: number; answerStartSec: number; score: number };

/**
 * Finds the spoken introduction to a submitted question. It only accepts a match
 * whose opening words occur close to the candidate cue, so a repeated topic in a
 * preceding answer cannot win merely because it appears in a long look-ahead window.
 */
export function alignQuestionToCaptions(
  segment: Pick<CanonicalSegment, "questionText" | "speakerNames">,
  cues: CaptionCue[],
  fromSec = 0,
  untilSec = Number.POSITIVE_INFINITY
): CaptionAlignment | null {
  let best: CaptionAlignment | null = null;
  const questionWords = normalizedWords(segment.questionText);
  const openingWords = questionWords.slice(0, 8);
  for (let index = 0; index < cues.length; index += 1) {
    const cue = cues[index];
    if (cue.startSec < fromSec || cue.startSec >= untilSec) continue;
    const normalizedCue = cue.text.toLowerCase().replace(/[^a-z0-9]+/g, " ");
    const directSpeakerScore = speakerScore(segment.speakerNames, cue.text);
    const mentionsOpening = openingWords.some((word) => normalizedCue.includes(word));
    // The questioner's name or opening phrase normally appears in the cue that
    // introduces a submission. Skipping all other cues avoids repeatedly scoring
    // thousands of answer-only caption windows.
    if (!directSpeakerScore && !mentionsOpening) continue;
    const window = cues
      .slice(index)
      .filter((following) => following.startSec < Math.min(untilSec, cue.startSec + 100));
    const text = window.map((following) => following.text).join(" ");
    const normalized = text.toLowerCase().replace(/[^a-z0-9]+/g, " ");
    const firstWord = questionWords.find((word) => normalized.includes(word));
    const firstPosition = firstWord ? normalized.indexOf(firstWord) : Number.POSITIVE_INFINITY;
    // A captioned spoken word is normally about 2.5 words/sec. Penalize a candidate
    // that merely precedes the real question by many seconds.
    const delayPenalty = Number.isFinite(firstPosition) ? Math.min(0.8, firstPosition / 150) : 0.8;
    const score =
      overlapScore(segment.questionText, text) + directSpeakerScore * 0.8 - delayPenalty;
    if (!best || score > best.score || (score === best.score && cue.startSec < best.startSec)) {
      best = { startSec: Math.floor(cue.startSec), answerStartSec: Math.floor(cue.endSec), score };
    }
  }
  return best && best.score >= 0.45 ? best : null;
}

/** Caption text between an answer boundary and the next question boundary. */
export function captionTextBetween(cues: CaptionCue[], fromSec: number, untilSec: number) {
  return cleanText(
    cues
      .filter((cue) => cue.startSec >= fromSec && cue.startSec < untilSec)
      .map((cue) => cue.text)
      .join(" ")
  );
}

/** Finds the caption cue immediately following the spoken question. */
export function answerStartAfterQuestion(
  segment: Pick<CanonicalSegment, "questionText">,
  cues: CaptionCue[],
  questionStartSec: number,
  nextQuestionStartSec = Number.POSITIVE_INFINITY
) {
  const expectedQuestionMarks = Math.max(1, (segment.questionText.match(/\?/g) ?? []).length);
  const earliestPlausibleAnswer =
    questionStartSec + Math.max(4, spokenWordCount(segment.questionText) / 3.3);
  const punctuationDeadline = earliestPlausibleAnswer + 12;
  let seenQuestionMarks = 0;
  for (const [index, cue] of cues.entries()) {
    if (cue.startSec < questionStartSec || cue.startSec >= nextQuestionStartSec) continue;
    if (cue.startSec > punctuationDeadline) break;
    const questionMarks = (cue.text.match(/\?/g) ?? []).length;
    seenQuestionMarks += questionMarks;
    if (
      questionMarks &&
      seenQuestionMarks >= expectedQuestionMarks &&
      cue.endSec >= earliestPlausibleAnswer
    )
      return Math.floor(cues[index + 1]?.startSec ?? cue.endSec);
  }
  // Captions occasionally omit question punctuation. At Sean's measured reading pace,
  // this is a conservative fallback that avoids swallowing most of the answer.
  const estimate = earliestPlausibleAnswer;
  return Math.floor(cues.find((cue) => cue.startSec >= estimate)?.startSec ?? estimate);
}
