/**
 * The Mindscape lockup, set in live type rather than shipped as a bitmap.
 *
 * Proportions are lifted from the cover art (`assets/SCM-rectangle-medium-1.jpg`):
 * the script line's cap height is 0.6× the wordmark's, baselines sit 0.76em
 * apart, and the wordmark spans ~83% of the artwork's width. Montserrat stands
 * in for the original's geometric sans.
 */
export function MindscapeWordmark({ tagline }: { tagline?: string }) {
  return (
    <h1 className="relative z-10 w-full text-center">
      <span className="sr-only">Sean Carroll&rsquo;s Mindscape — AMA search</span>
      <span
        aria-hidden="true"
        className="mx-auto block w-[min(91vw,980px)] select-none font-display font-black leading-[0.88] [font-size:clamp(2.65rem,11.6vw,7.25rem)] [text-shadow:0_3px_34px_rgb(12_24_66_/_35%)]"
      >
        <span className="block text-[0.58em] font-bold tracking-[-0.025em] text-[#070f63]">
          Sean Carroll&rsquo;s
        </span>
        <span className="block tracking-[-0.055em] text-white">MINDSCAPE</span>
        {tagline && (
          <span className="mt-[0.34em] block text-[0.16em] font-semibold uppercase tracking-[0.42em] text-white/75">
            {tagline}
          </span>
        )}
      </span>
    </h1>
  );
}
