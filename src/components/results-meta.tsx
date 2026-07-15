/** "128 results · 41 ms" — the honest-brag latency line, plus the transient
 * "re-ranked with semantic matching" notice (DESIGN.md §2.2). */
export function ResultsMeta({
  count,
  latencyMs,
  showRerankNotice
}: {
  count: number;
  latencyMs: number | null;
  showRerankNotice: boolean;
}) {
  return (
    <div className="flex min-h-[1.25rem] items-center gap-3 px-4 pb-3 text-caption text-text-tertiary">
      <span>
        {count} result{count === 1 ? "" : "s"}
        {latencyMs !== null && <span className="font-mono"> · {Math.round(latencyMs)} ms</span>}
      </span>
      <span
        aria-live="polite"
        className={`transition-opacity duration-1000 ${showRerankNotice ? "opacity-100" : "opacity-0"}`}
      >
        {showRerankNotice ? "Re-ranked with semantic matching" : ""}
      </span>
    </div>
  );
}
