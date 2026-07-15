import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  discoverEpisodes,
  ingest,
  extractLegacyQuestions,
  normalizeEpisode,
  parseTranscriptCues
} from "../pipeline/ingest";

const archiveOne = `
  <article><h2><a href="/podcast/2024/01/08/ama-january-2024/">AMA | January 2024</a></h2><time datetime="2024-01-08">January 8, 2024</time></article>
  <article><h2><a href="/podcast/2024/01/15/not-an-ama/">12 | Not an AMA</a></h2><time datetime="2024-01-15">January 15, 2024</time></article>
  <nav class="nav-next"><a href="https://example.test/podcast/page/2/">Next</a></nav>
`;
const archiveTwo = `
  <article><h2><a href="/podcast/2023/12/11/ama-december-2023/">AMA | December 2023</a></h2><time datetime="2023-12-11">December 11, 2023</time></article>
`;
const januaryEpisode = `
  <html><body><article>
    <audio src="https://audio.example.test/january.mp3"></audio>
    <iframe src="https://www.youtube.com/embed/abcdefghijk"></iframe>
    <h5>Click to Show Full Transcript</h5>
    <div>
      0:00:01 SC: Welcome to the show.\n
      0:00:10 Sean Carroll: Ada Lovelace asks, "What is time?" It is a useful coordinate.\n
      0:01:00 Sean Carroll: It is also relative to a clock.\n
      0:02:00 Sean Carroll: Bob writes: "Why now?" Because this is the right moment.
    </div>
    <div>← Previous Post</div>
  </article></body></html>
`;
const decemberEpisode = januaryEpisode.replaceAll("January", "December");

const legacyTranscriptEpisode = januaryEpisode.replace("Click to Show Full Transcript", "Click to Show Episode Transcript");

function fixtureFetch(calls: string[]) {
  return async (url: string) => {
    calls.push(url);
    if (url === "https://example.test/podcast/") return archiveOne;
    if (url === "https://example.test/podcast/page/2/") return archiveTwo;
    if (url.includes("ama-january")) return januaryEpisode;
    if (url.includes("ama-december")) return decemberEpisode;
    throw new Error(`Unexpected request: ${url}`);
  };
}

describe("AMA ingest", () => {
  it("walks paginated archives and selects only monthly AMA posts", async () => {
    const episodes = await discoverEpisodes(fixtureFetch([]), "https://example.test/podcast/");
    expect(episodes).toEqual([
      {
        title: "AMA | December 2023",
        publishDate: "2023-12-11",
        sourceUrl: "https://example.test/podcast/2023/12/11/ama-december-2023/"
      },
      {
        title: "AMA | January 2024",
        publishDate: "2024-01-08",
        sourceUrl: "https://example.test/podcast/2024/01/08/ama-january-2024/"
      }
    ]);
  });

  it("normalizes transcript text, timestamps, questioners, and media metadata", () => {
    const episode = normalizeEpisode(
      {
        title: "AMA | January 2024",
        publishDate: "2024-01-08",
        sourceUrl: "https://example.test/podcast/2024/01/08/ama-january-2024/"
      },
      januaryEpisode,
      7
    );
    expect(parseTranscriptCues(episode.transcriptText).map((cue) => cue.startSec)).toEqual([1, 10, 60, 120]);
    expect(episode).toMatchObject({
      episodeId: "ama-2024-01",
      number: 7,
      transcriptUrl: "https://example.test/podcast/2024/01/08/ama-january-2024/",
      youtubeId: "abcdefghijk",
      audioUrl: "https://audio.example.test/january.mp3",
      speakers: expect.arrayContaining(["Sean Carroll", "Ada Lovelace", "Bob"])
    });
    expect(episode.segments[0]).toMatchObject({ segmentId: "ama-2024-01#q01", type: "intro", startSec: 1 });
    expect(episode.segments[1]).toMatchObject({
      segmentId: "ama-2024-01#q02",
      type: "question",
      questionText: "What is time?",
      startSec: 10,
      endSec: 120,
      speakerNames: expect.arrayContaining(["Ada Lovelace", "Sean Carroll"])
    });
    expect(episode.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("accepts the older official Episode Transcript accordion label", () => {
    const episode = normalizeEpisode(
      { title: "AMA | January 2024", publishDate: "2024-01-08", sourceUrl: "https://example.test/ama" },
      legacyTranscriptEpisode,
      1
    );
    expect(episode.transcriptText).toContain("What is time?");
  });

  it("uses the official question-only accordion when a legacy page has no transcript block", () => {
    const legacy = `<article><div class="entry-content">
      <p>[accordion title="Click to Show AMA Questions"]Click above to close.</p>
      <p>Ada Lovelace<br>What is time?</p><p>Bob<br>Why now?</p><p>[/accordion-item][/accordion]</p>
    </div></article>`;
    expect(extractLegacyQuestions(legacy)).toEqual([
      { speaker: "Ada Lovelace", text: "What is time?" },
      { speaker: "Bob", text: "Why now?" }
    ]);
  });

  it("writes snapshots and processes an episode only on its first discovery", async () => {
    const root = await mkdtemp(join(tmpdir(), "mindscape-ingest-"));
    const contentDirectory = join(root, "content", "episodes");
    const rawCacheDirectory = join(root, "raw-cache");
    const firstCalls: string[] = [];
    const first = await ingest({
      fetchText: fixtureFetch(firstCalls),
      podcastUrl: "https://example.test/podcast/",
      contentDirectory,
      rawCacheDirectory
    });
    expect(first).toMatchObject({ discovered: 2, processed: 2, skipped: 0 });
    // Content-addressed snapshots intentionally de-duplicate byte-identical sources.
    expect((await readdir(rawCacheDirectory)).filter((file) => file.endsWith(".html"))).toHaveLength(1);
    expect(JSON.parse(await readFile(join(rawCacheDirectory, "index.json"), "utf8"))).toMatchObject({
      "https://example.test/podcast/2024/01/08/ama-january-2024/": expect.any(String)
    });
    const firstEpisode = JSON.parse(await readFile(join(contentDirectory, "ama-2024-01.json"), "utf8"));
    expect(firstEpisode.transcriptText).toContain("What is time?");

    const secondCalls: string[] = [];
    const second = await ingest({
      fetchText: fixtureFetch(secondCalls),
      podcastUrl: "https://example.test/podcast/",
      contentDirectory,
      rawCacheDirectory
    });
    expect(second).toMatchObject({ discovered: 2, processed: 0, skipped: 2 });
    expect(secondCalls).toEqual([
      "https://example.test/podcast/",
      "https://example.test/podcast/page/2/"
    ]);
  });
});
