import { messageTypes } from "@askai/core";
import { addChromeMessageListener, sendRuntimeMessage } from "../src/chrome";
import { detectSensitivePage, extractPageContext } from "../src/content/extraction";

function isTopFrame(): boolean {
  try {
    return window.top === window;
  } catch {
    return false;
  }
}

function notifySelectionChanged(): void {
  // Sensitive pages may turn benign at extraction time but acquire a password
  // field or checkout form afterward — re-check every selection so we never
  // ship the selected text from a page that just became sensitive.
  if (detectSensitivePage()) {
    return;
  }

  const selectedText = window.getSelection()?.toString().trim();

  if (!selectedText) {
    return;
  }

  void sendRuntimeMessage({
    type: messageTypes.selectionChanged,
    text: selectedText,
    title: document.title,
    url: window.location.href,
  });
}

export default defineContentScript({
  matches: ["<all_urls>"],
  allFrames: true,
  matchAboutBlank: false,
  main() {
    // Only the top frame extracts text or emits selection events. Sub-frame
    // instances exist solely so the top-frame extractor can reach into
    // same-origin iframes if needed; cross-origin iframes are surfaced via
    // structural sensitivity checks (iframe origins).
    if (!isTopFrame()) {
      return;
    }

    addChromeMessageListener((message, sender) => {
      if (sender.id !== chrome.runtime.id || sender.tab) {
        return undefined;
      }

      if (message.type !== messageTypes.pageContextRequest) {
        return undefined;
      }

      return {
        ...extractPageContext(message.mode),
        tabId: message.tabId,
      };
    });

    let selectionTimer: number | undefined;

    document.addEventListener("selectionchange", () => {
      window.clearTimeout(selectionTimer);
      selectionTimer = window.setTimeout(notifySelectionChanged, 150);
    });
  },
});
