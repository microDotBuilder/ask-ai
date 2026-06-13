import { spawnSync } from "node:child_process";
import { copyFileSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateExtensionIcons } from "./generate-extension-icons";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const extensionRoot = path.join(repoRoot, "apps/extension");
const outputDir = path.join(extensionRoot, ".output");
const skipPublish =
  process.argv.includes("--no-publish") || process.env.ASK_AI_SKIP_PUBLISH === "1";

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

// 1. Regenerate the alpha extension icons and build the production ZIP.
await generateExtensionIcons("alpha");
run("bun", ["wxt", "zip", "--browser", "chrome"], {
  cwd: extensionRoot,
  env: { ...process.env, ASK_AI_RELEASE_CHANNEL: "alpha", NODE_ENV: "production" },
});

// 2. Locate the freshest ZIP that wxt just produced.
const zipName = readdirSync(outputDir)
  .filter((name) => name.endsWith(".zip"))
  .map((name) => ({ name, mtime: statSync(path.join(outputDir, name)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime)[0]?.name;

if (!zipName) {
  throw new Error(`No .zip artifact found in ${outputDir}`);
}
const zipPath = path.join(outputDir, zipName);

if (skipPublish) {
  console.log(`Built ${zipName}. Skipping GitHub release (--no-publish).`);
  process.exit(0);
}

// 3. Derive a unique, sortable prerelease tag for this build.
const { version } = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
  version: string;
};
const fullSha = capture("git", ["rev-parse", "HEAD"]);
const shortSha = capture("git", ["rev-parse", "--short", "HEAD"]);
const stamp = new Date()
  .toISOString()
  .slice(0, 16)
  .replace(/[-:T]/g, "")
  .replace(/(\d{8})(\d{4})/, "$1.$2");
const tag = `v${version}-alpha.${stamp}`;
const title = `Ask AI Alpha ${version} (${shortSha})`;
const repo = capture("gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"]);

// 4. Stage the branded logo so it is both attached and embeddable in the notes.
const logoName = "ask-ai-alpha-logo.png";
const logoPath = path.join(outputDir, logoName);
copyFileSync(path.join(extensionRoot, "public/icon-alpha/128.png"), logoPath);
const logoUrl = `https://github.com/${repo}/releases/download/${tag}/${logoName}`;

// 5. Write the release notes with the logo at the top, plus install steps.
const notesPath = path.join(outputDir, "RELEASE_NOTES.md");
const notes = `<p align="center">
  <img src="${logoUrl}" width="96" alt="Ask AI Alpha" />
</p>

# Ask AI Alpha ${version}

Chrome Manifest V3 extension build (commit \`${shortSha}\`).

## Install

1. Download **\`${zipName}\`** below and unzip it.
2. Open \`chrome://extensions\` and enable **Developer mode**.
3. Click **Load unpacked** and select the unzipped folder.

The same ZIP works on macOS, Windows, and Linux.
`;
writeFileSync(notesPath, notes);

// 6. Publish the prerelease with the ZIP and logo attached.
console.log(`Creating GitHub release ${tag} on ${repo}…`);
run("gh", [
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
  "--prerelease",
]);

console.log(`Published ${tag}: https://github.com/${repo}/releases/tag/${tag}`);
