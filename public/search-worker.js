let manifest;
let records = [];
const normalize = (value) =>
  value
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, " ");
const distance = (a, b) => {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    let previous = i;
    row[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const current = row[j + 1];
      row[j + 1] = Math.min(row[j + 1] + 1, row[j] + 1, previous + (a[i] === b[j] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
};
const fuzzy = (term, word) => term.length > 3 && distance(term, word) <= (term.length > 7 ? 2 : 1);
async function load() {
  const shards = manifest.shards.filter((shard) => shard.kind === "docs");
  const manifestUrl = new URL("data/manifest.json", self.location.href);
  const data = await Promise.all(
    shards.map((shard) =>
      fetch(new URL(shard.url, manifestUrl)).then((response) => response.json())
    )
  );
  records = data.flatMap((shard) => shard.records);
}
self.onmessage = async ({ data }) => {
  if (data.type === "init") {
    manifest = data.manifest;
    await load();
    self.postMessage({ type: "ready" });
    return;
  }
  if (data.type !== "search") return;
  const { query, year, type, episode } = data.state;
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  const matches = records
    .filter(
      (record) =>
        (!year || String(record.episode.year) === year) &&
        (!type || type === "all" || record.type === type) &&
        (!episode || record.episode.id === episode)
    )
    .map((record) => {
      const text = normalize(`${record.questionText} ${record.answerText} ${record.episode.title}`);
      const words = text.split(/\s+/);
      const score = terms.reduce(
        (sum, term) =>
          sum + (text.includes(term) ? 5 : words.some((word) => fuzzy(term, word)) ? 1 : -100),
        0
      );
      return { ...record, score };
    })
    .filter((record) => !terms.length || record.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 100);
  self.postMessage({ type: "results", results: matches });
};
