"use client";

export function ThemeToggle({
  theme,
  onToggle,
  onArtwork = false
}: {
  theme: string;
  onToggle: () => void;
  /** Sitting over the homepage masthead, where the theme tokens have no contrast. */
  onArtwork?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      className={`rounded-md border px-2.5 py-1.5 text-caption transition-colors duration-[120ms] ${
        onArtwork
          ? "border-white/25 bg-white/5 text-white/75 hover:text-white"
          : "border-border text-text-secondary hover:text-text-primary"
      }`}
    >
      <span aria-hidden="true">◐</span>
      <span className="ml-1.5 hidden sm:inline">{theme === "dark" ? "Light" : "Dark"}</span>
    </button>
  );
}
