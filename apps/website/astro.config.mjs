import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";

// Static marketing site for the Ask AI Chrome extension.
// Deployed to Cloudflare Pages; output is a fully static `dist/`.
export default defineConfig({
  site: process.env.PUBLIC_SITE_URL ?? "https://askpane.ca",
  integrations: [sitemap()],
  build: {
    inlineStylesheets: "auto",
  },
});
