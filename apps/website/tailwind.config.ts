import type { Config } from "tailwindcss";

// Palette mirrors the new-redesign.html visual language: very dark backgrounds,
// grayscale ink, white accent. No blue brand color anymore.
export default {
  content: ["./src/**/*.{astro,html,ts,tsx,md,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "#050608",
        "bg-2": "#080a0d",
        panel: {
          DEFAULT: "#0e1014",
          strong: "#15181e",
          deep: "#1d2027",
          // Kept for legacy class names; resolves to the new strong panel.
          hover: "#15181e",
        },
        line: {
          DEFAULT: "rgba(255,255,255,0.07)",
          soft: "rgba(255,255,255,0.04)",
          strong: "rgba(255,255,255,0.16)",
        },
        ink: {
          DEFAULT: "#eceef4",
          muted: "#9aa1b0",
          faint: "#646c7c",
        },
        accent: {
          DEFAULT: "#e0e3eb",
          bright: "#ffffff",
          deep: "#9aa1b0",
        },
        ok: "#56d8a6",
        warn: "#e7b15a",
      },
      fontFamily: {
        sans: [
          '"Hanken Grotesk"',
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "system-ui",
          "sans-serif",
        ],
        display: [
          "Geist",
          '"Space Grotesk"',
          "system-ui",
          "sans-serif",
        ],
        mono: [
          '"Geist Mono"',
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      maxWidth: {
        content: "1180px",
      },
      boxShadow: {
        shot: "0 40px 90px -40px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.02)",
        float:
          "0 36px 60px -20px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.03) inset",
      },
    },
  },
  plugins: [],
} satisfies Config;
