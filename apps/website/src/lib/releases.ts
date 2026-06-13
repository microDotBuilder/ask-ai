import { SITE } from "./site";

// The extension ZIP carries its version in the filename
// (e.g. `ask-ai-0.0.0-alpha-chrome-mv3.zip`), so a hard-coded "latest" link
// would rot on every version bump. Instead we resolve the real asset URLs from
// the GitHub Releases API at *build time* and bake them into the static HTML.
// Re-run the build (Cloudflare Pages deploy hook on release publish) to refresh.

export type ReleaseChannel = "stable" | "alpha";

export type ResolvedRelease = {
  channel: ReleaseChannel;
  /** Human label, e.g. "v0.0.0" or "v0.0.0-alpha.202606131159". */
  version: string | null;
  /** ISO date the release was published, or null. */
  publishedAt: string | null;
  /** Direct download URL for the Chrome ZIP, or null if unavailable. */
  downloadUrl: string | null;
  /** Asset size in bytes, or null. */
  sizeBytes: number | null;
  /** Always-valid page to fall back to (the release/tag page). */
  pageUrl: string;
  /** Whether a downloadable build was found. */
  available: boolean;
};

type GhAsset = { name: string; size: number; browser_download_url: string };
type GhRelease = {
  tag_name: string;
  name: string | null;
  prerelease: boolean;
  draft: boolean;
  published_at: string | null;
  html_url: string;
  assets: GhAsset[];
};

function pickChromeZip(release: GhRelease): GhAsset | null {
  const assets = release.assets ?? [];
  return (
    assets.find((a) => a.name.endsWith(".zip") && a.name.toLowerCase().includes("chrome")) ??
    assets.find((a) => a.name.endsWith(".zip")) ??
    null
  );
}

function toResolved(channel: ReleaseChannel, release: GhRelease | undefined): ResolvedRelease {
  const fallbackPage = channel === "stable" ? `${SITE.repoUrl}/releases/latest` : SITE.releasesUrl;
  if (!release) {
    return {
      channel,
      version: null,
      publishedAt: null,
      downloadUrl: null,
      sizeBytes: null,
      pageUrl: fallbackPage,
      available: false,
    };
  }
  const zip = pickChromeZip(release);
  return {
    channel,
    version: release.name?.trim() || release.tag_name,
    publishedAt: release.published_at,
    downloadUrl: zip?.browser_download_url ?? null,
    sizeBytes: zip?.size ?? null,
    pageUrl: release.html_url,
    available: zip != null,
  };
}

let cache: { stable: ResolvedRelease; alpha: ResolvedRelease } | null = null;

export async function getReleases(): Promise<{
  stable: ResolvedRelease;
  alpha: ResolvedRelease;
}> {
  if (cache) return cache;

  // Resolve each channel from the endpoint best suited to it:
  //  - stable → /releases/latest, which natively excludes prereleases/drafts and
  //    is immune to a page filling up with alphas (404 when no stable exists yet).
  //  - alpha  → first prerelease on the (paginated) list, newest first.
  const [stable, alpha] = await Promise.all([fetchLatestStable(), fetchLatestAlpha()]);

  cache = {
    stable: toResolved("stable", stable),
    alpha: toResolved("alpha", alpha),
  };
  return cache;
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "ask-ai-website-build",
  };
  // Optional token lifts the 60 req/hr unauthenticated rate limit in CI.
  // GITHUB_TOKEN or GH_TOKEN (the latter is what the `gh` CLI uses) are accepted.
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function fetchLatestStable(): Promise<GhRelease | undefined> {
  try {
    const res = await fetch(`https://api.github.com/repos/${SITE.repo}/releases/latest`, {
      headers: buildHeaders(),
    });
    // 404 simply means no published non-prerelease yet — a normal pre-launch state.
    if (res.status === 404) return undefined;
    if (!res.ok) {
      console.warn(`[releases] stable: GitHub API responded ${res.status}; using fallback link.`);
      return undefined;
    }
    const data = (await res.json()) as unknown;
    return data && typeof data === "object" ? (data as GhRelease) : undefined;
  } catch (error) {
    console.warn("[releases] stable: failed to reach GitHub API; using fallback link.", error);
    return undefined;
  }
}

async function fetchLatestAlpha(): Promise<GhRelease | undefined> {
  try {
    const res = await fetch(`https://api.github.com/repos/${SITE.repo}/releases?per_page=100`, {
      headers: buildHeaders(),
    });
    if (!res.ok) {
      console.warn(`[releases] alpha: GitHub API responded ${res.status}; using fallback link.`);
      return undefined;
    }
    const data = (await res.json()) as unknown;
    // A 2xx with a non-array body (proxy/error envelope) must not crash the build.
    const releases = Array.isArray(data) ? (data as GhRelease[]) : [];
    return releases.find((r) => r.prerelease && !r.draft);
  } catch (error) {
    console.warn("[releases] alpha: failed to reach GitHub API; using fallback link.", error);
    return undefined;
  }
}

export function formatSize(bytes: number | null): string | null {
  if (!bytes) return null;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
