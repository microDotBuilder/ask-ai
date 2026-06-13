import { publishRelease } from "./release-shared";

// Build the alpha (prerelease) Chrome ZIP and publish it to GitHub Releases.
// Pass `--no-publish` to only build the ZIP under apps/extension/.output/.
await publishRelease("alpha");
