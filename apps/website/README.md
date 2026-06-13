# @askai/website

Marketing site for the **Ask AI** Chrome extension. Built with [Astro](https://astro.build) +
Tailwind CSS, deployed to **Cloudflare Pages**. Fully static — no server, no runtime.

It mirrors the extension's dark visual language (see `tailwind.config.ts`) and presents three ways
to install:

1. **Chrome Web Store** — the primary "Add to Chrome" button. Hidden behind `PUBLIC_CHROME_STORE_URL`;
   shows a "coming soon" badge until that variable is set.
2. **Stable build** — the latest non-prerelease ZIP from GitHub Releases (load unpacked).
3. **Alpha build** — the latest prerelease ZIP from GitHub Releases (load unpacked).

The Stable/Alpha download links are resolved from the **GitHub Releases API at build time**
(`src/lib/releases.ts`) and baked into the static HTML, so they always point at the real asset even
though the version is embedded in the filename. Re-run the build to refresh them (see deploy hook below).

## Develop

```sh
bun install                       # from the repo root
bun --filter @askai/website dev   # http://localhost:4321
```

Other scripts:

```sh
bun --filter @askai/website build      # static build → dist/
bun --filter @askai/website preview    # serve the built site
bun --filter @askai/website typecheck  # astro check
```

## Configuration

Copy `.env.example` to `.env` (local) or set the same keys in Cloudflare Pages:

| Variable | Purpose |
| --- | --- |
| `PUBLIC_SITE_URL` | Canonical URL for OG tags + sitemap. |
| `PUBLIC_CHROME_STORE_URL` | Web Store listing URL. **Leave empty** until approved → button shows "coming soon". |
| `GITHUB_TOKEN` / `GH_TOKEN` | Optional; either lifts the 60 req/hr anonymous limit when resolving release links in CI. |

## Deploy: Cloudflare Pages

Connect the repo and use these build settings:

| Setting | Value |
| --- | --- |
| Framework preset | Astro |
| Build command | `bun install && bun --filter @askai/website build` |
| Build output directory | `apps/website/dist` |
| Root directory | _(repo root — leave blank)_ |

Add the environment variables above under **Settings → Environment variables**.

### Keep download links fresh

The Stable/Alpha links are resolved at build time, so cutting a new release should trigger a rebuild.
Create a **Deploy Hook** in Cloudflare Pages (Settings → Builds & deployments) and call its URL from
the release flow (e.g. a `curl` step after `gh release create`, or a GitHub Action on
`release: published`). Without it, links simply refresh on the next push to the default branch.

## Going live on the Chrome Web Store

1. Register a Chrome Web Store developer account ($5 one-time).
2. Submit the production ZIP (`bun run release:stable` at the repo root).
3. Once approved, set `PUBLIC_CHROME_STORE_URL` to the listing URL and redeploy. The hero and
   download CTAs flip from "coming soon" to a live "Add to Chrome" link automatically.
