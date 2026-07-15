import { readEpisodes } from "../lib/content";

export function validateEpisode(episode: Awaited<ReturnType<typeof readEpisodes>>[number]) {
  const ids = new Set<string>();
  let previousStart = -1;
  for (const segment of episode.segments) {
    if (ids.has(segment.segmentId))
      throw new Error(`${episode.episodeId}: duplicate segment id ${segment.segmentId}`);
    ids.add(segment.segmentId);
    if (!segment.segmentId.startsWith(`${episode.episodeId}#`))
      throw new Error(`${episode.episodeId}: segment id belongs to another episode`);
    if (segment.endSec !== null && segment.startSec !== null && segment.endSec < segment.startSec)
      throw new Error(`${segment.segmentId}: end timestamp precedes start timestamp`);
    if (segment.startSec !== null && segment.startSec < previousStart)
      throw new Error(`${episode.episodeId}: timestamps are not monotonic`);
    if (segment.startSec !== null) previousStart = segment.startSec;
  }
  if (episode.segments.length && !episode.segments.some((segment) => segment.type === "question"))
    throw new Error(`${episode.episodeId}: no question segments`);
}

export async function validate() {
  const episodes = await readEpisodes();
  const seen = new Set<string>();
  for (const episode of episodes) {
    if (seen.has(episode.episodeId)) throw new Error(`duplicate episode id ${episode.episodeId}`);
    seen.add(episode.episodeId);
    validateEpisode(episode);
  }
  return episodes;
}

if (import.meta.url === `file://${process.argv[1]}`)
  validate().then((episodes) => console.log(`Validated ${episodes.length} episodes.`));
