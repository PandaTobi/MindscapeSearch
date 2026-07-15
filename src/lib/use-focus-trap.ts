import { useEffect, useRef } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])'
].join(",");

/**
 * Focus management for a modal overlay: on mount, remember what had focus and
 * move focus into the container; while open, keep Tab cycling inside it; on
 * unmount, restore focus to the trigger. Used by the shortcuts overlay, the
 * jump-to-question palette, and the mobile filter sheet.
 *
 * The transcript panel deliberately does NOT use this — DESIGN.md §2.4 keeps
 * the results live and navigable behind it, i.e. non-modal; it restores focus
 * to its trigger through the caller instead.
 */
export function useFocusTrap<T extends HTMLElement>(active: boolean) {
  const containerRef = useRef<T>(null);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );

    // Move focus in — prefer the first focusable, else the container itself.
    const first = focusables()[0];
    if (first) first.focus();
    else container.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = focusables();
      if (!items.length) {
        event.preventDefault();
        return;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      const activeEl = document.activeElement;
      if (event.shiftKey && (activeEl === firstItem || activeEl === container)) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && activeEl === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };

    container.addEventListener("keydown", onKeyDown);
    return () => {
      container.removeEventListener("keydown", onKeyDown);
      // Restore focus to the trigger if it's still in the document.
      if (previouslyFocused && previouslyFocused.isConnected) previouslyFocused.focus();
    };
  }, [active]);

  return containerRef;
}
