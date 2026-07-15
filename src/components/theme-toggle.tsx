"use client";

export function ThemeToggle({ theme, onToggle }: { theme: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      className="rounded-md border border-border px-2.5 py-1.5 text-caption text-text-secondary transition-colors duration-[120ms] hover:text-text-primary"
    >
      <span aria-hidden="true">◐</span>
      <span className="ml-1.5 hidden sm:inline">{theme === "dark" ? "Light" : "Dark"}</span>
    </button>
  );
}
