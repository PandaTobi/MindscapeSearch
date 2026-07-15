"use client";

import { type ReactNode, useState } from "react";

export function FacetGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-b border-border py-4 first:pt-0 last:border-b-0">
      <h3 className="px-1 text-micro uppercase tracking-[0.06em] text-text-tertiary">{title}</h3>
      <div className="mt-2">{children}</div>
    </div>
  );
}

export function FacetRow({
  label,
  count,
  active,
  onSelect
}: {
  label: string;
  count?: number;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={`flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left text-body transition-colors duration-[120ms] hover:bg-bg-raised ${
        active ? "text-text-primary" : "text-text-secondary"
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? "bg-accent" : "bg-text-tertiary/50"}`}
      />
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && (
        <span className="font-mono text-micro text-text-tertiary">{count}</span>
      )}
    </button>
  );
}

export function EpisodeFacet({
  episodes,
  activeId,
  onSelect
}: {
  episodes: Array<{ id: string; number: number; title: string; year: number; count?: number }>;
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const query = filter.trim().toLowerCase();
  const filtered = query
    ? episodes.filter(
        (episode) =>
          episode.title.toLowerCase().includes(query) || String(episode.year).includes(query)
      )
    : episodes;
  return (
    <div>
      <label className="relative block px-1">
        <span className="sr-only">Filter episodes</span>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary"
        >
          ⌕
        </span>
        <input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter episodes…"
          className="w-full rounded-md border border-border bg-transparent py-1.5 pl-6 pr-2 text-body text-text-primary placeholder:text-text-tertiary focus-visible:outline-none"
        />
      </label>
      <FacetRow label="All episodes" active={!activeId} onSelect={() => onSelect("")} />
      <div className="max-h-60 overflow-y-auto">
        {filtered.map((episode) => (
          <FacetRow
            key={episode.id}
            label={`AMA ${episode.number} · ${episode.year}`}
            count={episode.count}
            active={activeId === episode.id}
            onSelect={() => onSelect(episode.id)}
          />
        ))}
        {!filtered.length && (
          <p className="px-1 py-2 text-caption text-text-tertiary">No episodes match.</p>
        )}
      </div>
    </div>
  );
}

export function ActiveFilterChips({
  chips,
  onRemove
}: {
  chips: Array<{ key: string; label: string }>;
  onRemove: (key: string) => void;
}) {
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap gap-2 px-1 pb-4">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => onRemove(chip.key)}
          className="flex items-center gap-1.5 rounded-md border border-border bg-bg-raised px-2 py-1 text-caption text-text-secondary transition-colors duration-[120ms] hover:text-text-primary"
        >
          {chip.label}
          <span aria-hidden="true">✕</span>
        </button>
      ))}
    </div>
  );
}
