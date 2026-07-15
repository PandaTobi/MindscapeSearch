/** Case/diacritic-insensitive first-occurrence ranges — mirrors the worker's
 * length-preserving `normalize`/`ranges()` so char offsets found here line up
 * with the original text. NFD (not NFKD — see the worker's comment) keeps
 * compatibility characters like "…" at their original length. */
export function findRanges(text: string, terms: string[]): Array<[number, number]> {
  const normalized = text
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, " ");
  const found: Array<[number, number]> = [];
  for (const term of terms) {
    const from = normalized.indexOf(term);
    if (from >= 0) found.push([from, from + term.length]);
  }
  return found;
}

/** Total occurrence count of every term in `text` — drives the "N matches in
 * answer" annotation (SPEC.md §9: dedup passages, report the total). */
export function countMatches(text: string, terms: string[]): number {
  if (!terms.length) return 0;
  const normalized = text
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, " ");
  let total = 0;
  for (const term of terms) {
    if (!term) continue;
    let from = 0;
    for (;;) {
      const at = normalized.indexOf(term, from);
      if (at < 0) break;
      total += 1;
      from = at + term.length;
    }
  }
  return total;
}

export function mergeRanges(ranges: Array<[number, number]>): Array<[number, number]> {
  return [...ranges]
    .sort(([left], [right]) => left - right)
    .reduce<Array<[number, number]>>((all, range) => {
      const last = all.at(-1);
      if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
      else all.push([...range]);
      return all;
    }, []);
}
