export const secondsToClock = (seconds: number | null) => {
  if (seconds === null) return "Episode";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
};
export const mediaUrl = (youtubeId: string | null, audioUrl: string, start: number | null) =>
  youtubeId
    ? `https://www.youtube.com/watch?v=${youtubeId}${start === null ? "" : `&t=${start}s`}`
    : `${audioUrl}${start === null ? "" : `#t=${start}`}`;
