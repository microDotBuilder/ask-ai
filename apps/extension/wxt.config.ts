import { defineConfig } from "wxt";

const isDev = process.env.NODE_ENV === "development";
const isAlpha = !isDev && process.env.ASK_AI_RELEASE_CHANNEL === "alpha";
const iconDir = isDev ? "icon-dev" : isAlpha ? "icon-alpha" : "icon";
const unusedIconDirs = ["icon", "icon-alpha", "icon-dev"]
  .filter((dir) => dir !== iconDir)
  .map((dir) => `${dir}/**`);
const version = "0.0.0";
const appName = isDev ? "Ask AI (dev)" : isAlpha ? "Ask AI Alpha" : "Ask AI";
const icons = {
  "16": `${iconDir}/16.png`,
  "32": `${iconDir}/32.png`,
  "48": `${iconDir}/48.png`,
  "96": `${iconDir}/96.png`,
  "128": `${iconDir}/128.png`,
};

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  zip: {
    name: "ask-ai",
    artifactTemplate: "{{name}}-{{version}}-{{browser}}-{{manifestVersion}}.zip",
    compressionLevel: 9,
    exclude: [...unusedIconDirs, "**/*.map"],
    zipSources: false,
  },
  manifest: {
    name: appName,
    short_name: isAlpha ? "Ask AI Alpha" : "Ask AI",
    description: "Ask anything about the page you are viewing.",
    version,
    ...(isAlpha ? { version_name: `${version}-alpha` } : {}),
    minimum_chrome_version: "116",
    permissions: ["activeTab", "contextMenus", "sidePanel", "scripting", "storage", "alarms"],
    host_permissions: ["<all_urls>"],
    content_security_policy: {
      extension_pages: [
        "script-src 'self' 'wasm-unsafe-eval'",
        "object-src 'self'",
        "base-uri 'none'",
        "frame-ancestors 'none'",
        "connect-src 'self' https://api.openai.com https://openrouter.ai",
      ].join("; "),
    },
    icons,
    action: {
      default_title: appName,
      default_icon: icons,
    },
    side_panel: {
      default_path: "sidepanel.html",
    },
    options_ui: {
      page: "options.html",
      open_in_tab: true,
    },
    commands: {
      "open-ask-ai": {
        suggested_key: {
          default: "Ctrl+Shift+A",
          mac: "Command+Shift+A",
        },
        description: "Open Ask AI for the current tab",
      },
      "summarize-page": {
        description: "Summarize the current page with Ask AI",
      },
      "explain-selected": {
        description: "Explain the selected text with Ask AI",
      },
    },
  },
});
