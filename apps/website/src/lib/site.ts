// Central, typed site configuration. The only value that changes between
// "pre-store" and "live" is PUBLIC_CHROME_STORE_URL — set it in the environment
// (Cloudflare Pages → Settings → Environment variables) once the listing is approved.

const repo = "microDotBuilder/ask-ai";

export const SITE = {
  // Domain-anchored brand used in <title>, og:site_name, and JSON-LD — what
  // Google should treat as the searchable entity. Distinct from `name`, which
  // is the visible product label shown in the nav, footer, and chat UI.
  brand: "Askpane",
  name: "Ask AI",
  tagline: "Ask anything about the page you're viewing.",
  description:
    "Askpane (Ask AI) is a Chrome side-panel assistant that reads the current webpage and answers questions about it. Bring your own OpenAI or OpenRouter key — no hosted backend, history stays on your machine.",
  url: import.meta.env.PUBLIC_SITE_URL ?? "https://askpane.ca",
  repo,
  repoUrl: `https://github.com/${repo}`,
  releasesUrl: `https://github.com/${repo}/releases`,
  // Empty until the Chrome Web Store listing is approved. When empty the install
  // button renders as a "Coming soon" badge instead of a live link.
  chromeStoreUrl: import.meta.env.PUBLIC_CHROME_STORE_URL ?? "",
} as const;

export const chromeStoreLive = SITE.chromeStoreUrl.length > 0;
