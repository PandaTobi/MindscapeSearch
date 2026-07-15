import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        "bg-raised": "var(--bg-raised)",
        border: "var(--border)",
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        "text-tertiary": "var(--text-tertiary)",
        accent: "var(--accent)",
        highlight: "var(--highlight)"
      },
      fontFamily: {
        sans: "var(--font-sans)",
        mono: "var(--font-mono)"
      },
      fontSize: {
        display: ["2rem", { lineHeight: "1.2", fontWeight: "600", letterSpacing: "-0.01em" }],
        title: ["1.25rem", { lineHeight: "1.3", fontWeight: "600" }],
        question: ["1.0625rem", { lineHeight: "1.45", fontWeight: "550" }],
        "body-read": ["1rem", { lineHeight: "1.7", fontWeight: "400" }],
        body: ["0.875rem", { lineHeight: "1.6", fontWeight: "400" }],
        caption: ["0.8125rem", { lineHeight: "1.4", fontWeight: "450" }],
        micro: ["0.6875rem", { lineHeight: "1.3", fontWeight: "500", letterSpacing: "0.06em" }]
      },
      borderRadius: {
        md: "6px",
        lg: "10px"
      },
      maxWidth: {
        results: "680px",
        read: "65ch"
      },
      width: {
        rail: "240px"
      },
      transitionTimingFunction: {
        panel: "cubic-bezier(0.32, 0.72, 0, 1)"
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" }
        },
        pulse-bg: {
          "0%": { backgroundColor: "color-mix(in srgb, var(--accent) 8%, transparent)" },
          "100%": { backgroundColor: "transparent" }
        },
        rise: {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        }
      },
      animation: {
        shimmer: "shimmer 1.2s ease-in-out infinite",
        "pulse-bg": "pulse-bg 800ms ease-out",
        rise: "rise 80ms ease-out"
      }
    }
  },
  plugins: []
} satisfies Config;
