"use client";

import { useEffect, useMemo, useRef } from "react";
import { ART_HEIGHT, ART_WIDTH, buildConstellation } from "@/lib/constellation";

/**
 * A responsive vector interpretation of the Mindscape cover. The three
 * filament planes move by slightly different amounts under the pointer, which
 * gives the web a soft, elastic depth without moving the wordmark.
 */
export function MindscapeBackdrop({ className }: { className?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const artwork = useMemo(() => buildConstellation(), []);

  useEffect(() => {
    const root = rootRef.current;
    const masthead = root?.closest<HTMLElement>(".mindscape-masthead");
    if (!root || !masthead || matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;

    const draw = () => {
      currentX += (targetX - currentX) * 0.12;
      currentY += (targetY - currentY) * 0.12;
      root.style.setProperty("--mind-x", currentX.toFixed(3));
      root.style.setProperty("--mind-y", currentY.toFixed(3));
      if (Math.abs(targetX - currentX) > 0.002 || Math.abs(targetY - currentY) > 0.002) {
        frame = requestAnimationFrame(draw);
      } else {
        frame = 0;
      }
    };

    const move = (event: PointerEvent) => {
      const bounds = masthead.getBoundingClientRect();
      if (
        event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom
      ) {
        leave();
        return;
      }
      targetX = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
      targetY = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
      if (!frame) frame = requestAnimationFrame(draw);
    };
    const leave = () => {
      targetX = 0;
      targetY = 0;
      if (!frame) frame = requestAnimationFrame(draw);
    };

    window.addEventListener("pointermove", move, { passive: true });
    masthead.addEventListener("pointerleave", leave);
    return () => {
      window.removeEventListener("pointermove", move);
      masthead.removeEventListener("pointerleave", leave);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={rootRef} className={`mindscape-art ${className ?? ""}`} aria-hidden="true">
      <svg
        viewBox={`0 0 ${ART_WIDTH} ${ART_HEIGHT}`}
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full"
      >
        <defs>
          <linearGradient id="ms-base" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#202e68" />
            <stop offset=".48" stopColor="#315ca5" />
            <stop offset="1" stopColor="#3670b1" />
          </linearGradient>
          <radialGradient id="ms-column" cx=".5" cy=".13" r=".61">
            <stop offset="0" stopColor="#b8d9e9" stopOpacity=".68" />
            <stop offset=".48" stopColor="#89bad9" stopOpacity=".3" />
            <stop offset="1" stopColor="#6b9bc6" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="ms-aqua" cx=".5" cy="1" r=".58">
            <stop offset="0" stopColor="#c0eee2" stopOpacity=".9" />
            <stop offset=".46" stopColor="#90d8d3" stopOpacity=".44" />
            <stop offset="1" stopColor="#65b5c4" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="ms-vignette" cx=".5" cy=".5" r=".7">
            <stop offset=".48" stopColor="#0d1644" stopOpacity="0" />
            <stop offset=".82" stopColor="#10194b" stopOpacity=".18" />
            <stop offset="1" stopColor="#0a1238" stopOpacity=".72" />
          </radialGradient>
          <linearGradient id="ms-streak">
            <stop offset="0" stopColor="#d6eaff" stopOpacity="0" />
            <stop offset=".5" stopColor="#d6eaff" stopOpacity=".25" />
            <stop offset="1" stopColor="#d6eaff" stopOpacity="0" />
          </linearGradient>
          <filter id="ms-soft-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
        </defs>

        <rect width={ART_WIDTH} height={ART_HEIGHT} fill="url(#ms-base)" />
        <rect width={ART_WIDTH} height={ART_HEIGHT} fill="url(#ms-column)" />
        <rect width={ART_WIDTH} height={ART_HEIGHT} fill="url(#ms-aqua)" />

        {[0, 1, 2].map((depth) => (
          <g key={depth} className={`mindscape-plane mindscape-plane-${depth + 1}`}>
            <g>
              {artwork.layers
                .filter((_, index) => index % 3 === depth)
                .map((layer) => (
                  <path
                    key={`${layer.color}${layer.opacity}${layer.width}`}
                    d={layer.d}
                    stroke={layer.color}
                    strokeOpacity={layer.opacity * 1.22}
                    strokeWidth={layer.width}
                    fill="none"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
            </g>
            <g fill="#eaf8ff">
              {artwork.dots
                .filter((_, index) => index % 3 === depth)
                .map((dot) => (
                  <circle
                    key={`${dot.cx},${dot.cy},${dot.r}`}
                    cx={dot.cx}
                    cy={dot.cy}
                    r={dot.r}
                    fillOpacity={Math.min(1, dot.opacity * 1.12)}
                  />
                ))}
            </g>
          </g>
        ))}

        <ellipse
          cx="512"
          cy="535"
          rx="255"
          ry="50"
          fill="#baf1e5"
          fillOpacity=".25"
          filter="url(#ms-soft-glow)"
        />
        <ellipse cx="150" cy="250" rx="255" ry="2.5" fill="url(#ms-streak)" />
        <ellipse cx="880" cy="196" rx="235" ry="2" fill="url(#ms-streak)" />
        <rect width={ART_WIDTH} height={ART_HEIGHT} fill="url(#ms-vignette)" />
      </svg>
      <span className="mindscape-cursor-hint">move through the constellation</span>
    </div>
  );
}
