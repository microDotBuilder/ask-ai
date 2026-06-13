import { messageTypes } from "@askai/core";
import { addChromeMessageListener, sendRuntimeMessage } from "../src/chrome";
import { extractPageContext } from "../src/content/extraction";

function notifySelectionChanged(): void {
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

function createSelectionButton(): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Ask AI";
  button.setAttribute("aria-label", "Ask AI about selected text");
  Object.assign(button.style, {
    position: "fixed",
    zIndex: "2147483647",
    display: "none",
    border: "1px solid rgba(15, 23, 42, 0.16)",
    borderRadius: "6px",
    background: "#0f172a",
    color: "#ffffff",
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.18)",
    font: "500 13px/1 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    padding: "8px 10px",
    cursor: "pointer",
  });
  document.documentElement.append(button);
  return button;
}

function getSelectionRect(): DOMRect | undefined {
  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0 || !selection.toString().trim()) {
    return undefined;
  }

  const range = selection.getRangeAt(0);
  const rects = Array.from(range.getClientRects()).filter(
    (rect) => rect.width > 0 && rect.height > 0,
  );
  return rects[0] ?? undefined;
}

function installSelectionFloatingButton(): void {
  const button = createSelectionButton();
  let selectedText = "";

  const hide = () => {
    button.style.display = "none";
  };

  const showForSelection = () => {
    const selection = window.getSelection();
    selectedText = selection?.toString().trim() ?? "";

    if (!selectedText) {
      hide();
      return;
    }

    const rect = getSelectionRect();
    if (!rect) {
      hide();
      return;
    }

    button.style.left = `${Math.min(window.innerWidth - 88, Math.max(8, rect.left))}px`;
    button.style.top = `${Math.max(8, rect.top - 42)}px`;
    button.style.display = "block";
  };

  button.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });

  button.addEventListener("click", () => {
    const focus = selectedText || window.getSelection()?.toString().trim();
    if (!focus) {
      hide();
      return;
    }

    hide();
    void sendRuntimeMessage({
      type: messageTypes.quickActionRequest,
      actionId: "explain",
      focus,
      mode: "full-page",
    });
  });

  document.addEventListener("pointerdown", (event) => {
    if (event.target !== button) {
      hide();
    }
  });
  window.addEventListener("scroll", hide, true);
  window.addEventListener("resize", hide);

  let selectionTimer: number | undefined;
  document.addEventListener("selectionchange", () => {
    window.clearTimeout(selectionTimer);
    selectionTimer = window.setTimeout(showForSelection, 120);
  });
}

export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
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

    installSelectionFloatingButton();
  },
});
