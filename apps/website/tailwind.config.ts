import type { Config } from "tailwindcss";

// Brand palette mirrors the extension side panel (apps/extension side panel CSS)
// so the marketing site and the product share one dark visual language.
export default {
  content: ["./src/**/*.{astro,html,ts,tsx,md,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "#121212",
        panel: {
          DEFAULT: "#1b1b1b",
          strong: "#202020",
          hover: "#282828",
        },
        line: {
          DEFAULT: "#2d2d2d",
          soft: "#242424",
        },
        ink: {
          DEFAULT: "#f4f7fb",
          muted: "#9aa1ad",
          // ≥4.5:1 on #121212 (was #707070 at 3.78:1, failing WCAG AA).
          faint: "#8b919c",
        },
        brand: {
          DEFAULT: "#2f6fed",
          soft: "#274f9f",
        },
        ok: "#1f7a59",
        warn: "#ffd58a",
      },
      fontFamily: {
        sans: [
          '"Inter Variable"',
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "system-ui",
          "sans-serif",
        ],
        mono: [
          '"Roboto Mono Variable"',
          '"Roboto Mono"',
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      maxWidth: {
        content: "72rem",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(47,111,237,0.35), 0 18px 60px -20px rgba(47,111,237,0.55)",
      },
    },
  },
  plugins: [],
} satisfies Config;
