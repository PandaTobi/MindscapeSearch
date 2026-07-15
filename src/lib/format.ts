export const secondsToClock = (seconds: number | null) => {
  if (seconds === null) return "Episode";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
};
export const youtubeUrl = (youtubeId: string | null, start: number | null) =>
  youtubeId
    ? `https://www.youtube.com/watch?v=${youtubeId}${start === null ? "" : `&t=${start}s`}`
    : null;

export const mediaUrl = (youtubeId: string | null, audioUrl: string, start: number | null) =>
  youtubeUrl(youtubeId, start) ?? `${audioUrl}${start === null ? "" : `#t=${start}`}`;

/** "AMA · JUNE 2026" — the meta-row episode badge, per DESIGN.md §2.3. */
export const episodeBadge = (date: string) =>
  `AMA · ${new Date(`${date}T00:00:00`)
    .toLocaleDateString("en-US", { year: "numeric", month: "long" })
    .toUpperCase()}`;

/** "#q14" from a `segmentId` like "ama-2024-06#q14". */
export const questionLabel = (segmentId: string) => {
  const at = segmentId.indexOf("#");
  return at >= 0 ? `#${segmentId.slice(at + 1)}` : segmentId;
};

/** "June 2026" — the corpus-stats footer's freshness signal. */
export const monthYear = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { year: "numeric", month: "long" });
