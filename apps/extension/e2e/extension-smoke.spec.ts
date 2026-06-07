import { expect, test, chromium, type BrowserContext } from "@playwright/test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const extensionPath = path.resolve(".output/chrome-mv3");
const chromeUiSmokeLimitation =
  "toolbar side panel, keyboard shortcuts, and selected-text entrypoint require headed Chrome UI automation and are covered in docs/qa/manual-verification-checklist.md";

interface ExtensionManifest {
  options_ui?: {
    page?: string;
  };
  side_panel?: {
    default_path?: string;
  };
}

function readManifest(): ExtensionManifest {
  return JSON.parse(readFileSync(path.join(extensionPath, "manifest.json"), "utf8"));
}

async function launchExtension(): Promise<{
  context: BrowserContext;
  extensionId: string;
  profileDir: string;
}> {
  const profileDir = mkdtempSync(path.join(tmpdir(), "ask-ai-extension-"));
  const context = await chromium.launchPersistentContext(profileDir, {
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    headless: false,
  });
  const serviceWorker =
    context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  const extensionId = new URL(serviceWorker.url()).host;

  return {
    context,
    extensionId,
    profileDir,
  };
}

test("loads the built extension side panel and options pages", async () => {
  test.skip(!existsSync(extensionPath), "Run `bun run build` before extension smoke tests.");

  const manifest = readManifest();
  const sidePanelPath = manifest.side_panel?.default_path;
  const optionsPath = manifest.options_ui?.page;

  expect(sidePanelPath).toBeTruthy();
  expect(optionsPath).toBeTruthy();

  const { context, extensionId, profileDir } = await launchExtension();

  try {
    const sidePanel = await context.newPage();
    await sidePanel.goto(`chrome-extension://${extensionId}/${sidePanelPath}`);
    await expect(sidePanel.getByRole("heading", { name: /Ask AI|Set up Ask AI/ })).toBeVisible();

    const options = await context.newPage();
    await options.goto(`chrome-extension://${extensionId}/${optionsPath}`);
    await expect(options.getByRole("heading", { name: "Ask AI Options" })).toBeVisible();
  } finally {
    await context.close();
    rmSync(profileDir, { force: true, recursive: true });
  }
});

test.describe("Chrome UI smoke coverage", () => {
  test.skip(chromeUiSmokeLimitation, () => undefined);
});
