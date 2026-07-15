import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { JSDOM } from "jsdom";
import { contentDir, sha256, stableJson } from "../lib/content";
import { episodeSchema, type CanonicalEpisode, type CanonicalSegment } from "../lib/schema";

export const podcastUrl = "https://preposterousuniverse.com/podcast/";
const userAgent = "MindscapeSearch-ingest/0.1 (+https://github.com/andyjiang/MindscapeSearch)";

export type FetchText = (url: string) => Promise<string>;

export type DiscoveredEpisode = {
  title: string;
  publishDate: string;
  sourceUrl: string;
};

export type IngestOptions = {
  fetchText?: FetchText;
  podcastUrl?: string;
  contentDirectory?: string;
  rawCacheDirectory?: string;
  /** Limits archive traversal when manually debugging; omitted in normal CI runs. */
  maxArchivePages?: number;
};

export type IngestResult = {
  discovered: number;
  processed: number;
  skipped: number;
  episodeIds: string[];
};

function cleanText(value: string) {
  return value.replace(/\u00a0/g, " ").normalize("NFC").replace(/\s+/g, " ").trim();
}

function cleanMultiline(value: string) {
  return value
    .replace(/\r/g, "")
    .split("\n")
    .map(cleanText)
    .filter(Boolean)
    .join("\n");
}

function toIsoDate(value: string, fallbackUrl: string) {
  const date = new Date(value);
  if (!Number.isNaN(date.valueOf())) return date.toISOString().slice(0, 10);
  const fromUrl = fallbackUrl.match(/\/(\d{4})\/(\d{2})\/(\d{2})(?:\/|$)/);
  if (fromUrl) return `${fromUrl[1]}-${fromUrl[2]}-${fromUrl[3]}`;
  throw new Error(`Could not determine publication date for ${fallbackUrl}`);
}

function absoluteUrl(href: string, base: string) {
  return new URL(href, base).toString();
}

// Some older WordPress pages include malformed inline CSS. It is unrelated to content.
function documentFromHtml(html: string) {
  return new JSDOM(html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")).window.document;
}

/** Finds AMA entries on one WordPress archive page. */
export function discoverFromArchive(html: string, archiveUrl: string): DiscoveredEpisode[] {
  const document = documentFromHtml(html);
  const found = new Map<string, DiscoveredEpisode>();
  for (const link of document.querySelectorAll("a[href]")) {
    const title = cleanText(link.textContent ?? "");
    if (!/^AMA\s*(?:[|:—–-]\s*)?[A-Za-z]+\s+\d{4}$/i.test(title)) continue;
    const sourceUrl = absoluteUrl(link.getAttribute("href")!, archiveUrl);
    const article = link.closest("article, .post, .type-post") ?? link.parentElement;
    const dateNode = article?.querySelector("time[datetime], time, .entry-date, .posted-on");
    const dateText = dateNode?.getAttribute("datetime") ?? dateNode?.textContent ?? "";
    found.set(sourceUrl, { title, sourceUrl, publishDate: toIsoDate(cleanText(dateText), sourceUrl) });
  }
  return [...found.values()];
}

function nextArchiveUrl(html: string, currentUrl: string) {
  const document = documentFromHtml(html);
  const next = document.querySelector('a[rel="next"], .nav-next a, .next.page-numbers');
  return next?.getAttribute("href") ? absoluteUrl(next.getAttribute("href")!, currentUrl) : null;
}

/** Walk every archive page, not just the first page currently visible in the browser. */
export async function discoverEpisodes(
  fetchText: FetchText,
  startUrl = podcastUrl,
  maxPages = Number.POSITIVE_INFINITY
) {
  const episodes = new Map<string, DiscoveredEpisode>();
  const visited = new Set<string>();
  let current: string | null = startUrl;
  while (current && !visited.has(current) && visited.size < maxPages) {
    visited.add(current);
    const html = await fetchText(current);
    for (const episode of discoverFromArchive(html, current)) episodes.set(episode.sourceUrl, episode);
    current = nextArchiveUrl(html, current);
  }
  return [...episodes.values()].sort((a, b) => a.publishDate.localeCompare(b.publishDate));
}

function parseTimestamp(value: string) {
  const parts = value.split(":").map(Number);
  if (parts.some(Number.isNaN) || parts.length < 2 || parts.length > 3) return null;
  const seconds = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
  return Math.max(0, Math.floor(seconds));
}

export type TranscriptCue = { startSec: number; speaker: string; text: string };

/**
 * The official transcript is an inline, timestamped transcript.  This recognises both
 * h:mm:ss and mm:ss cues and leaves text between cues intact for later normalization.
 */
export function parseTranscriptCues(transcriptText: string): TranscriptCue[] {
  const cue = /(?:^|\n)\s*((?:\d{1,2}:)?\d{1,2}:\d{2}(?:\.\d+)?)\s+([^:\n]{1,100}):\s*/g;
  const matches = [...transcriptText.matchAll(cue)];
  return matches
    .map((match, index) => ({
      startSec: parseTimestamp(match[1]) ?? 0,
      speaker: canonicalSpeaker(match[2]),
      text: cleanMultiline(transcriptText.slice((match.index ?? 0) + match[0].length, matches[index + 1]?.index))
    }))
    .filter((cue) => cue.text.length > 0);
}

function canonicalSpeaker(value: string) {
  const speaker = cleanText(value).replace(/[.]+$/, "");
  return /^(?:SC|Sean Carroll)$/i.test(speaker) ? "Sean Carroll" : speaker;
}

/** Extracts only the expandable transcript; archive questions and footer text are excluded. */
export function extractTranscript(html: string) {
  const document = documentFromHtml(html);
  const bodyText = document.body.textContent?.replace(/\r/g, "") ?? "";
  // The site used both labels during its WordPress/accordion-template transition.
  const marker = /Click to Show (?:Full |Episode )?Transcript/i;
  const match = marker.exec(bodyText);
  if (!match || match.index === undefined) throw new Error("Official transcript marker was not found");
  const afterMarker = bodyText.slice(match.index + match[0].length).replace(/^\s*/u, "");
  const end = afterMarker.search(/\n\s*(?:←\s*Previous Post|Leave a Comment|Related Posts)\b/i);
  const transcriptText = cleanMultiline(end >= 0 ? afterMarker.slice(0, end) : afterMarker);
  if (!parseTranscriptCues(transcriptText).length)
    throw new Error("Official transcript contains no timestamped speaker cues");
  return { transcriptUrl: "", transcriptText };
}

type LegacyQuestion = { speaker: string; text: string };

/** The earliest AMA post publishes questions in an accordion but no text transcript. */
export function extractLegacyQuestions(html: string): LegacyQuestion[] {
  const document = documentFromHtml(html);
  const paragraphs = [...document.querySelectorAll("article .entry-content p, article p")];
  const start = paragraphs.findIndex((paragraph) => /Click to Show AMA Q/i.test(paragraph.textContent ?? ""));
  if (start < 0) return [];
  const questions: LegacyQuestion[] = [];
  for (const paragraph of paragraphs.slice(start + 1)) {
    const source = paragraph.innerHTML;
    if (/\[\/accordion-item\]|Click to Show (?:Full |Episode )?Transcript/i.test(source)) break;
    const lines = source
      .split(/<br\s*\/?\s*>/i)
      .map((line) => cleanText(new JSDOM(`<body>${line}</body>`).window.document.body.textContent ?? ""))
      .filter(Boolean);
    if (lines.length < 2) continue;
    const [speaker, ...question] = lines;
    questions.push({ speaker: canonicalSpeaker(speaker), text: question.join(" ") });
  }
  return questions;
}

function countTokens(value: string) {
  return value ? value.trim().split(/\s+/).length : 0;
}

type PendingSegment = Omit<CanonicalSegment, "segmentId" | "endSec" | "order" | "tokens">;

function questionFromCue(text: string) {
  const match = text.match(
    /^(?<speaker>[A-Z][\p{L}\p{M}'’ .-]{0,80}?)\s+(?:asks|asked|writes|wrote|wants to know)\s*[:,]?\s*[“"]?(?<question>[\s\S]*?\?)[”"]?(?:\s|$)/u
  );
  if (!match?.groups) return null;
  return {
    speaker: canonicalSpeaker(match.groups.speaker),
    question: cleanText(match.groups.question),
    remainder: cleanText(text.slice(match[0].length))
  };
}

/** Converts timestamped speaker turns into deterministic Q&A/search segments. */
export function segmentsFromTranscript(transcriptText: string): Omit<CanonicalSegment, "segmentId">[] {
  const cues = parseTranscriptCues(transcriptText);
  const pending: PendingSegment[] = [];
  let activeQuestion: PendingSegment | null = null;
  const appendAnswer = (text: string, speaker: string, startSec: number) => {
    if (!text) return;
    if (!activeQuestion) {
      pending.push({ type: "intro", questionText: "", answerText: text, startSec, speakerNames: [speaker] });
      return;
    }
    activeQuestion.answerText = cleanText(`${activeQuestion.answerText} ${text}`);
    activeQuestion.speakerNames = [...new Set([...activeQuestion.speakerNames, speaker])];
  };

  for (const cue of cues) {
    const question = questionFromCue(cue.text);
    const isExternalQuestion = cue.speaker !== "Sean Carroll" && /\?$/.test(cue.text);
    if (question || isExternalQuestion) {
      if (activeQuestion) pending.push(activeQuestion);
      activeQuestion = {
        type: "question",
        questionText: question?.question ?? cue.text,
        answerText: question?.remainder ?? "",
        startSec: cue.startSec,
        speakerNames: [question?.speaker ?? cue.speaker, "Sean Carroll"]
      };
    } else {
      appendAnswer(cue.text, cue.speaker, cue.startSec);
    }
  }
  if (activeQuestion) pending.push(activeQuestion);
  if (!pending.length) throw new Error("Transcript could not be converted to segments");

  return pending.map((segment, order) => ({
    ...segment,
    endSec: null,
    order,
    tokens: countTokens(`${segment.questionText} ${segment.answerText}`)
  }));
}

function findAudioUrl(document: Document, sourceUrl: string) {
  const candidate = document.querySelector<HTMLAudioElement>("audio[src]")?.src
    ?? document.querySelector<HTMLSourceElement>('audio source[src], source[type^="audio/"][src]')?.src
    ?? [...document.querySelectorAll<HTMLAnchorElement>('a[href$=".mp3" i], a[href*=".mp3?" i]')][0]?.href;
  return candidate ? absoluteUrl(candidate, sourceUrl) : sourceUrl;
}

function findYoutubeId(document: Document) {
  const sources = [
    ...[...document.querySelectorAll<HTMLElement>("iframe[src], a[href]")].map((element) =>
      element.getAttribute("src") ?? element.getAttribute("href") ?? ""
    ),
    document.documentElement.innerHTML
  ];
  for (const source of sources) {
    const match = source.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/))([A-Za-z0-9_-]{11})/);
    if (match) return match[1];
  }
  return null;
}

function normalizeQuestionListEpisode(discovered: DiscoveredEpisode, html: string, number: number): CanonicalEpisode {
  const document = documentFromHtml(html);
  const questions = extractLegacyQuestions(html);
  if (!questions.length) throw new Error(`${episodeIdFor(discovered.publishDate)}: no official questions found`);
  const episodeId = episodeIdFor(discovered.publishDate);
  const segments = questions.map((question, order) => ({
    segmentId: `${episodeId}#q${String(order + 1).padStart(2, "0")}`,
    type: "question" as const,
    questionText: question.text,
    answerText: "",
    startSec: null,
    endSec: null,
    order,
    tokens: countTokens(question.text),
    speakerNames: [question.speaker]
  }));
  const canonical = {
    episodeId,
    number,
    title: discovered.title,
    publishDate: discovered.publishDate,
    sourceUrl: discovered.sourceUrl,
    transcriptUrl: discovered.sourceUrl,
    transcriptText: questions.map((question) => `${question.speaker}: ${question.text}`).join("\n\n"),
    speakers: [...new Set(questions.map((question) => question.speaker))],
    audioUrl: findAudioUrl(document, discovered.sourceUrl),
    youtubeId: findYoutubeId(document),
    durationSec: 1,
    segments,
    contentHash: ""
  };
  canonical.contentHash = sha256(stableJson({ ...canonical, contentHash: undefined }));
  return episodeSchema.parse(canonical);
}

export function normalizeEpisode(discovered: DiscoveredEpisode, html: string, number: number): CanonicalEpisode {
  const document = documentFromHtml(html);
  const transcript = extractTranscript(html);
  const segmentsWithoutIds = segmentsFromTranscript(transcript.transcriptText);
  const segments = segmentsWithoutIds.map((segment, order) => ({
    ...segment,
    segmentId: `${episodeIdFor(discovered.publishDate)}#q${String(order + 1).padStart(2, "0")}`,
    endSec: segmentsWithoutIds[order + 1]?.startSec ?? null
  }));
  const speakers = [
    ...new Set([
      ...parseTranscriptCues(transcript.transcriptText).map((cue) => cue.speaker),
      ...segments.flatMap((segment) => segment.speakerNames)
    ])
  ];
  const episodeId = episodeIdFor(discovered.publishDate);
  const canonical = {
    episodeId,
    number,
    title: discovered.title,
    publishDate: discovered.publishDate,
    sourceUrl: discovered.sourceUrl,
    transcriptUrl: discovered.sourceUrl,
    transcriptText: transcript.transcriptText,
    speakers,
    audioUrl: findAudioUrl(document, discovered.sourceUrl),
    youtubeId: findYoutubeId(document),
    durationSec: Math.max(1, ...parseTranscriptCues(transcript.transcriptText).map((cue) => cue.startSec)),
    segments,
    contentHash: ""
  };
  canonical.contentHash = sha256(stableJson({ ...canonical, contentHash: undefined }));
  return episodeSchema.parse(canonical);
}

export function episodeIdFor(publishDate: string) {
  return `ama-${publishDate.slice(0, 7)}`;
}

async function defaultFetchText(url: string) {
  const response = await fetch(url, { headers: { "user-agent": userAgent } });
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  return response.text();
}

async function existingEpisodes(directory: string) {
  try {
    const files = (await readdir(directory)).filter((file) => file.endsWith(".json"));
    return await Promise.all(
      files.map(async (file) => episodeSchema.parse(JSON.parse(await readFile(join(directory, file), "utf8"))))
    );
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [] as CanonicalEpisode[];
    throw error;
  }
}

type RawCacheIndex = Record<string, string>;

async function readRawCacheIndex(directory: string): Promise<RawCacheIndex> {
  try {
    return JSON.parse(await readFile(join(directory, "index.json"), "utf8"));
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

async function readCachedSnapshot(directory: string, sourceUrl: string) {
  const hash = (await readRawCacheIndex(directory))[sourceUrl];
  if (!hash) return null;
  try {
    return await readFile(join(directory, `${hash}.html`), "utf8");
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function cacheSnapshot(directory: string, sourceUrl: string, html: string) {
  const hash = createHash("sha256").update(html).digest("hex");
  const snapshot = join(directory, `${hash}.html`);
  await mkdir(directory, { recursive: true });
  try {
    await readFile(snapshot);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await writeFile(snapshot, html);
  }
  const index = await readRawCacheIndex(directory);
  if (index[sourceUrl] !== hash) {
    index[sourceUrl] = hash;
    await writeFile(join(directory, "index.json"), stableJson(index));
  }
  return snapshot;
}

/**
 * Ingests only episodes absent from canonical content. Archive pages are read every run
 * so new monthly posts are discovered, but existing episode pages are never re-fetched.
 */
export async function ingest(options: IngestOptions = {}): Promise<IngestResult> {
  const fetchText = options.fetchText ?? defaultFetchText;
  const destination = options.contentDirectory ?? contentDir;
  const rawCacheDirectory = options.rawCacheDirectory ?? join(process.cwd(), "raw-cache");
  const discovered = await discoverEpisodes(fetchText, options.podcastUrl ?? podcastUrl, options.maxArchivePages);
  const existing = await existingEpisodes(destination);
  const knownIds = new Set(existing.map((episode) => episode.episodeId));
  const knownUrls = new Set(existing.map((episode) => episode.sourceUrl));
  let nextNumber = Math.max(0, ...existing.map((episode) => episode.number)) + 1;
  const processed: string[] = [];

  for (const item of discovered) {
    const episodeId = episodeIdFor(item.publishDate);
    if (knownIds.has(episodeId) || knownUrls.has(item.sourceUrl)) continue;
    const cached = await readCachedSnapshot(rawCacheDirectory, item.sourceUrl);
    const html = cached ?? (await fetchText(item.sourceUrl));
    if (!cached) await cacheSnapshot(rawCacheDirectory, item.sourceUrl, html);
    const number = nextNumber++;
    let episode: CanonicalEpisode;
    try {
      episode = normalizeEpisode(item, html, number);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("transcript marker")) throw error;
      episode = normalizeQuestionListEpisode(item, html, number);
    }
    await mkdir(destination, { recursive: true });
    await writeFile(join(destination, `${basename(episode.episodeId)}.json`), stableJson(episode));
    processed.push(episode.episodeId);
  }
  return { discovered: discovered.length, processed: processed.length, skipped: discovered.length - processed.length, episodeIds: processed };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingest().then((result) =>
    console.log(`Discovered ${result.discovered} AMA episodes; processed ${result.processed}; skipped ${result.skipped}.`)
  );
}
