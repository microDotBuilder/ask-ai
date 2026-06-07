import type { Config } from "tailwindcss";

export default {
  content: [
    "./entrypoints/**/*.{ts,tsx,html}",
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--askai-background))",
        foreground: "hsl(var(--askai-foreground))",
        muted: "hsl(var(--askai-muted))",
        "muted-foreground": "hsl(var(--askai-muted-foreground))",
        border: "hsl(var(--askai-border))",
        primary: "hsl(var(--askai-primary))",
        "primary-foreground": "hsl(var(--askai-primary-foreground))",
      },
    },
  },
  plugins: [],
} satisfies Config;
