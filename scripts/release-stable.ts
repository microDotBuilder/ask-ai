import { publishRelease } from "./release-shared";

// Build the stable (main) Chrome ZIP and publish it to GitHub Releases as a
// non-prerelease, tagged `v<version>`. This is the build that becomes the
// "latest" download on the marketing site and the Chrome Web Store submission.
// Pass `--no-publish` to only build the ZIP under apps/extension/.output/.
await publishRelease("stable");
