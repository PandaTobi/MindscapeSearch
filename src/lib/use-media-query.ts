import { useEffect, useState } from "react";

/** SSR-safe media query hook — starts `false` (matches the static export's
 * server-rendered markup) and syncs to the real value after mount. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const list = window.matchMedia(query);
    setMatches(list.matches);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

export const BREAKPOINTS = {
  tablet: "(min-width: 640px)",
  desktop: "(min-width: 1024px)"
} as const;
