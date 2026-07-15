/** Three gray bars matching ResultCard's real geometry (meta line, question,
 * snippet) — DESIGN.md §2.6.2. Shown while a query is in flight or the next
 * infinite-scroll batch is being prepared, never a spinner. */
export function SkeletonCard() {
  return (
    <li className="animate-pulse border-b border-border px-5 py-5" aria-hidden="true">
      <div className="h-3 w-40 rounded shimmer-bg animate-shimmer" />
      <div className="mt-3 h-4 w-3/4 rounded shimmer-bg animate-shimmer" />
      <div className="mt-3 h-3.5 w-full rounded shimmer-bg animate-shimmer" />
      <div className="mt-2 h-3.5 w-5/6 rounded shimmer-bg animate-shimmer" />
    </li>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <ul className="motion-reduce:animate-none">
      {Array.from({ length: count }, (_, index) => (
        <SkeletonCard key={index} />
      ))}
    </ul>
  );
}
