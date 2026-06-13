import { spawnSync } from "node:child_process";
import { copyFileSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type ExtensionIconVariant, generateExtensionIcons } from "./generate-extension-icons";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const extensionRoot = path.join(repoRoot, "apps/extension");
const outputDir = path.join(extensionRoot, ".output");

export type ReleaseChannel = "alpha" | "stable";

interface ChannelConfig {
  /** Icon set generated before the build. */
  iconVariant: ExtensionIconVariant;
  /** Extra env passed to `wxt zip` (alpha flips the manifest name + icons). */
  buildEnv: NodeJS.ProcessEnv;
  /** Directory under apps/extension/public holding the 128px branded logo. */
  iconDir: string;
  /** Human product name used in the release title and notes. */
  productName: string;
  /** Filename for the logo asset attached to the release. */
  logoName: string;
  /** Whether to mark the GitHub release as a prerelease. */
  prerelease: boolean;
}

const channels: Record<ReleaseChannel, ChannelConfig> = {
  alpha: {
    iconVariant: "alpha",
    buildEnv: { ASK_AI_RELEASE_CHANNEL: "alpha", NODE_ENV: "production" },
    iconDir: "public/icon-alpha",
    productName: "Ask AI Alpha",
    logoName: "ask-ai-alpha-logo.png",
    prerelease: true,
  },
  stable: {
    iconVariant: "stable",
    // Set the channel explicitly (don't rely on its absence) so a leaked
    // ASK_AI_RELEASE_CHANNEL=alpha in the shell can't turn a stable build into an
    // alpha-branded artifact. wxt.config.ts treats only an exact "alpha" as alpha.
    buildEnv: { ASK_AI_RELEASE_CHANNEL: "stable", NODE_ENV: "production" },
    iconDir: "public/icon",
    productName: "Ask AI",
    logoName: "ask-ai-logo.png",
    prerelease: false,
  },
};

function run(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`\`${command} ${args.join(" ")}\` failed with exit code ${result.status}`);
  }
}

function capture(command: string, args: string[]) {
  const result = spawnSync(command, args, { cwd: repoRoot, encoding: "utf8" });
  if (result.error || result.status !== 0) {
    throw new Error(`\`${command} ${args.join(" ")}\` failed: ${result.stderr ?? result.error}`);
  }
  return result.stdout.trim();
}

/** True if a GitHub release already exists for `tag` (non-throwing). */
function releaseExists(repo: string, tag: string) {
  const result = spawnSync("gh", ["release", "view", tag, "--repo", repo, "--json", "tagName"], {
    encoding: "utf8",
  });
  return result.status === 0;
}

/** Build the channel's production ZIP and publish it as a GitHub release. */
export async function publishRelease(channel: ReleaseChannel) {
  const config = channels[channel];
  const skipPublish =
    process.argv.includes("--no-publish") || process.env.ASK_AI_SKIP_PUBLISH === "1";

  // 1. Regenerate the channel's extension icons and build the production ZIP.
  await generateExtensionIcons(config.iconVariant);
  run("bun", ["wxt", "zip", "--browser", "chrome"], {
    cwd: extensionRoot,
    env: { ...process.env, ...config.buildEnv },
  });

  // 2. Locate the freshest ZIP for THIS channel. Alpha artifacts carry "-alpha"
  //    in the filename (from the manifest version_name); stable ones do not. We
  //    filter by that signature before falling back to mtime so a stale
  //    cross-channel zip left in the shared .output can't be published by mistake.
  const isAlphaArtifact = (name: string) => name.includes("-alpha");
  const zipName = readdirSync(outputDir)
    .filter((name) => name.endsWith(".zip"))
    .filter((name) => isAlphaArtifact(name) === (channel === "alpha"))
    .map((name) => ({ name, mtime: statSync(path.join(outputDir, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)[0]?.name;

  if (!zipName) {
    throw new Error(`No .zip artifact found in ${outputDir}`);
  }
  const zipPath = path.join(outputDir, zipName);

  if (skipPublish) {
    console.log(`Built ${zipName}. Skipping GitHub release (--no-publish).`);
    return;
  }

  // 3. Derive the release tag. Alpha tags are unique + sortable per build; stable
  //    tags track the package version (`v0.0.0`) — one release per version.
  const { version } = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
    version: string;
  };
  const fullSha = capture("git", ["rev-parse", "HEAD"]);
  const shortSha = capture("git", ["rev-parse", "--short", "HEAD"]);

  let tag: string;
  if (channel === "alpha") {
    const stamp = new Date()
      .toISOString()
      .slice(0, 16)
      .replace(/[-:T]/g, "")
      .replace(/(\d{8})(\d{4})/, "$1.$2");
    tag = `v${version}-alpha.${stamp}`;
  } else {
    tag = `v${version}`;
  }
  const title = `${config.productName} ${version} (${shortSha})`;
  const repo = capture("gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"]);

  // Stable tags track the (pinned) package version, so a re-run reproduces the same
  // tag. Fail fast with an actionable message instead of a raw `gh` error.
  if (releaseExists(repo, tag)) {
    throw new Error(
      `A GitHub release tagged ${tag} already exists on ${repo}. ` +
        (channel === "stable"
          ? "Bump the version in package.json (and apps/extension/wxt.config.ts), or delete the existing release, before publishing a new stable build."
          : "Wait a moment so the timestamped tag changes, or delete the existing release, then re-run."),
    );
  }

  // 4. Stage the branded logo so it is both attached and embeddable in the notes.
  const logoPath = path.join(outputDir, config.logoName);
  copyFileSync(path.join(extensionRoot, config.iconDir, "128.png"), logoPath);
  const logoUrl = `https://github.com/${repo}/releases/download/${tag}/${config.logoName}`;

  // 5. Write the release notes with the logo at the top, plus install steps.
  const notesPath = path.join(outputDir, "RELEASE_NOTES.md");
  const notes = `<p align="center">
  <img src="${logoUrl}" width="96" alt="${config.productName}" />
</p>

# ${config.productName} ${version}

Chrome Manifest V3 extension build (commit \`${shortSha}\`).

## Install

1. Download **\`${zipName}\`** below and unzip it.
2. Open \`chrome://extensions\` and enable **Developer mode**.
3. Click **Load unpacked** and select the unzipped folder.

The same ZIP works on macOS, Windows, and Linux.
`;
  writeFileSync(notesPath, notes);

  // 6. Publish the release with the ZIP and logo attached.
  console.log(`Creating GitHub release ${tag} on ${repo}…`);
  const releaseArgs = [
    "release",
    "create",
    tag,
    zipPath,
    logoPath,
    "--repo",
    repo,
    "--target",
    fullSha,
    "--title",
    title,
    "--notes-file",
    notesPath,
  ];
  if (config.prerelease) {
    releaseArgs.push("--prerelease");
  }
  run("gh", releaseArgs);

  console.log(`Published ${tag}: https://github.com/${repo}/releases/tag/${tag}`);
}
