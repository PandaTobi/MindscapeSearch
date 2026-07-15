/** Real, evocative queries that teach the corpus's voice — shared by the
 * homepage hero and the empty state (DESIGN.md §2.1, §2.5: "one system, two
 * densities"). */
export const SAMPLE_QUERIES = [
  "many-worlds",
  "free will",
  "why is there something rather than nothing",
  "the arrow of time",
  "is there a god",
  "what happens after we die",
  "quantum immortality",
  "the measurement problem"
] as const;

/** Deterministic-enough shuffle for a given render — avoids a hydration
 * mismatch by only running after mount (callers gate this on `useEffect`). */
export function pickSampleQueries(count = 3): string[] {
  const pool = [...SAMPLE_QUERIES];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}
