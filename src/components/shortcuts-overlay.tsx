"use client";

const SHORTCUTS: Array<[string, string]> = [
  ["/ or ⌘K", "Focus search"],
  ["Esc", "Clear query → blur results → close panel (one layer per press)"],
  ["↑ ↓", "Move the result cursor"],
  ["Enter", "Open transcript for the focused card"],
  ["⌘Enter", "Play at timestamp in a new tab"],
  ["c", "Copy deep link for the focused card"],
  ["g then k / h / s", "Switch mode: keyword / hybrid / semantic"],
  ["f", "Open filters"],
  ["⌘J", "Jump to question (inside a transcript)"],
  ["j / k", "Next / previous segment (inside a transcript)"],
  ["?", "Toggle this overlay"]
];

export function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <button type="button" aria-label="Close" className="absolute inset-0" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        className="relative w-full max-w-md rounded-lg border border-border bg-bg-raised p-6"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-title text-text-primary">Keyboard shortcuts</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary"
          >
            ✕
          </button>
        </div>
        <dl className="space-y-2.5">
          {SHORTCUTS.map(([keys, description]) => (
            <div key={keys} className="flex items-baseline justify-between gap-4 text-body">
              <dt className="shrink-0 font-mono text-micro text-text-secondary">{keys}</dt>
              <dd className="text-right text-text-tertiary">{description}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
