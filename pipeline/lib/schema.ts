import { z } from "zod";

const segmentTypes = ["question", "answer", "intro", "other"] as const;

export const segmentSchema = z.object({
  segmentId: z.string().regex(/^ama-[a-z0-9-]+#q\d{2,}$/),
  type: z.enum(segmentTypes),
  questionText: z.string(),
  answerText: z.string(),
  startSec: z.number().int().nonnegative().nullable(),
  endSec: z.number().int().positive().nullable(),
  order: z.number().int().nonnegative(),
  tokens: z.number().int().nonnegative()
});

export const episodeSchema = z.object({
  episodeId: z.string().regex(/^ama-[a-z0-9-]+$/),
  number: z.number().int().positive(),
  title: z.string().min(1),
  publishDate: z.string().date(),
  sourceUrl: z.string().url(),
  audioUrl: z.string().url(),
  youtubeId: z.string().min(1).nullable(),
  durationSec: z.number().int().positive(),
  segments: z.array(segmentSchema),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/)
});

export type CanonicalEpisode = z.infer<typeof episodeSchema>;
export type CanonicalSegment = z.infer<typeof segmentSchema>;
