import type { APIRoute } from "astro";
import { SITE } from "../lib/site";

// Generated at build time so the Sitemap URL tracks PUBLIC_SITE_URL (custom domains)
// instead of being hardcoded to the pages.dev fallback.
export const GET: APIRoute = () => {
  const body = `User-agent: *
Allow: /

Sitemap: ${new URL("/sitemap-index.xml", SITE.url).href}
`;
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
