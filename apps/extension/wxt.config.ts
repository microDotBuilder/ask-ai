import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Ask AI",
    description: "Ask anything about the page you are viewing.",
    version: "0.0.0",
    minimum_chrome_version: "116",
    permissions: ["activeTab", "contextMenus", "sidePanel", "scripting", "storage"],
    host_permissions: ["<all_urls>"],
    action: {
      default_title: "Ask AI",
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
