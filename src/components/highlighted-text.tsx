import { type ReactNode } from "react";
import { mergeRanges } from "@/lib/highlight";

/** Renders `text` with `<mark>` spans over the given character ranges — the
 * keyword-match treatment from DESIGN.md §1 ("the only loud element on
 * screen"). Semantic-only hits (no exact term) pass `ranges={[]}` and instead
 * get the accent left-border treatment at the call site. */
export function HighlightedText({
  text,
  ranges = []
}: {
  text: string;
  ranges?: Array<[number, number]>;
}) {
  const merged = mergeRanges(ranges.filter(([start, end]) => start >= 0 && end > start && end <= text.length));
  if (!merged.length) return <>{text}</>;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (cursor < start) nodes.push(text.slice(cursor, start));
    nodes.push(
      <mark key={`${start}-${end}`} className="match-highlight">
        {text.slice(start, end)}
      </mark>
    );
    cursor = end;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return <>{nodes}</>;
}
