import {
  messageTypes,
  readSettings,
  type ContextMode,
  type PageContextResponseMessage,
  type PageContextUnavailableReason,
  type QuickActionId,
  type TabSessionUpdatedMessage,
} from "@askai/core";
import { createTabSessionRepository, initializeDatabase } from "@askai/db";
import { addChromeMessageListener, sendTabMessage } from "../src/chrome";
import { storePendingQuickAction, type PendingQuickAction } from "../src/product";

interface TabSession {
  id: string;
  tabId: number;
  url: string;
  title: string;
  active: boolean;
  selectionText?: string;
  updatedAt: string;
}

const tabSessions = new Map<number, TabSession>();

function nowIso(): string {
  return new Date().toISOString();
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function createUnavailableResponse(
  tabId: number | undefined,
  availability: "blocked" | "unsupported" | "failed",
  reason: PageContextUnavailableReason,
  message: string,
): PageContextResponseMessage {
  const response = {
    type: messageTypes.pageContextResponse,
    tabId,
    status: availability,
    unavailable: {
      availability,
      reason,
      message,
    },
  };
  return response as PageContextResponseMessage;
}

function isExcludedSite(url: string, excludedSites: readonly string[]): boolean {
  const domain = getDomain(url);
  const normalizedUrl = url.toLowerCase();
  const normalizedDomain = domain.toLowerCase();

  return excludedSites.some((site) => {
    const normalizedSite = site.trim().toLowerCase();

    if (!normalizedSite) {
      return false;
    }

    if (normalizedSite.includes("://")) {
      return normalizedUrl.startsWith(normalizedSite);
    }

    return normalizedDomain === normalizedSite || normalizedDomain.endsWith(`.${normalizedSite}`);
  });
}

async function classifyUrl(tab: chrome.tabs.Tab): Promise<PageContextResponseMessage | null> {
  const url = tab.url ?? "";

  if (!tab.id) {
    return createUnavailableResponse(
      undefined,
      "failed",
      "extraction-failed",
      "No active tab is available.",
    );
  }

  if (!url) {
    return createUnavailableResponse(
      tab.id,
      "unsupported",
      "content-script-unavailable",
      "This page does not expose a URL that Ask AI can read.",
    );
  }

  const parsedUrl = (() => {
    try {
      return new URL(url);
    } catch {
      return null;
    }
  })();

  if (!parsedUrl) {
    return createUnavailableResponse(
      tab.id,
      "unsupported",
      "content-script-unavailable",
      "This URL is unsupported.",
    );
  }

  if (
    ["chrome:", "chrome-extension:", "edge:", "about:", "devtools:"].includes(parsedUrl.protocol)
  ) {
    return createUnavailableResponse(
      tab.id,
      "unsupported",
      "browser-internal",
      "Browser internal pages cannot be read by extensions.",
    );
  }

  if (parsedUrl.hostname === "chromewebstore.google.com") {
    return createUnavailableResponse(
      tab.id,
      "unsupported",
      "chrome-web-store",
      "Chrome Web Store pages do not allow content extraction.",
    );
  }

  if (parsedUrl.pathname.toLowerCase().endsWith(".pdf")) {
    return createUnavailableResponse(
      tab.id,
      "unsupported",
      "pdf",
      "PDF pages are not supported yet.",
    );
  }

  const settings = await readSettings(chrome.storage.local);

  if (isExcludedSite(url, settings.excludedSites)) {
    return createUnavailableResponse(
      tab.id,
      "blocked",
      "excluded-site",
      "This site is excluded in Ask AI settings.",
    );
  }

  return null;
}

function upsertTabSession(tab: chrome.tabs.Tab, active = true): TabSession | null {
  if (!tab.id) {
    return null;
  }

  const existing = tabSessions.get(tab.id);
  const session: TabSession = {
    id: existing?.id ?? crypto.randomUUID(),
    tabId: tab.id,
    url: tab.url ?? existing?.url ?? "",
    title: tab.title ?? existing?.title ?? "",
    active,
    selectionText: existing?.selectionText,
    updatedAt: nowIso(),
  };

  tabSessions.set(tab.id, session);
  return session;
}

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function openSidePanelForTab(tab: chrome.tabs.Tab): Promise<void> {
  if (!tab.id) {
    return;
  }

  upsertTabSession(tab);
  await chrome.sidePanel.open({ tabId: tab.id });
}

async function dispatchQuickAction(
  tab: chrome.tabs.Tab,
  actionId: QuickActionId,
  focus?: string,
): Promise<void> {
  if (!tab.id) {
    return;
  }

  const action: PendingQuickAction = {
    actionId,
    tabId: tab.id,
    focus,
    mode: "full-page",
    createdAt: nowIso(),
  };
  await storePendingQuickAction(action);
  await openSidePanelForTab(tab);

  try {
    await chrome.runtime.sendMessage({
      type: messageTypes.quickActionRequest,
      actionId,
      tabId: tab.id,
      focus,
      mode: "full-page",
    });
  } catch {
    // The side panel reads the pending action from session storage when it starts.
  }
}

async function handleCommand(command: string): Promise<void> {
  const tab = await getActiveTab();

  if (!tab) {
    return;
  }

  if (command === "open-ask-ai") {
    await openSidePanelForTab(tab);
    return;
  }

  const commandActions: Record<string, QuickActionId> = {
    "summarize-page": "summarize",
    "explain-selected": "explain",
  };
  const actionId = commandActions[command];

  if (actionId) {
    const session = tab.id ? tabSessions.get(tab.id) : undefined;
    await dispatchQuickAction(
      tab,
      actionId,
      command === "explain-selected" ? session?.selectionText : undefined,
    );
  }
}

async function requestPageContext(
  tabId: number | undefined,
  mode: ContextMode,
): Promise<PageContextResponseMessage> {
  const tab = tabId ? await chrome.tabs.get(tabId) : await getActiveTab();

  if (!tab?.id) {
    return createUnavailableResponse(
      undefined,
      "failed",
      "extraction-failed",
      "No active tab is available.",
    );
  }

  upsertTabSession(tab);

  const unavailable = await classifyUrl(tab);

  if (unavailable) {
    return unavailable;
  }

  try {
    return await sendTabMessage(tab.id, {
      type: messageTypes.pageContextRequest,
      tabId: tab.id,
      mode,
    });
  } catch {
    return createUnavailableResponse(
      tab.id,
      "failed",
      "content-script-unavailable",
      "Ask AI could not connect to this page. Try reloading the tab.",
    );
  }
}

function toTabSessionMessage(session: TabSession): TabSessionUpdatedMessage {
  return {
    type: messageTypes.tabSessionUpdated,
    tabSessionId: session.id,
    tabId: session.tabId,
    url: session.url,
    title: session.title,
    active: session.active,
  };
}

export default defineBackground(() => {
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
      id: "askai-summarize-page",
      title: "Ask AI: Summarize page",
      contexts: ["page"],
    });
    chrome.contextMenus.create({
      id: "askai-explain-selection",
      title: "Ask AI: Explain selection",
      contexts: ["selection"],
    });
    chrome.contextMenus.create({
      id: "askai-rewrite-selection",
      title: "Ask AI: Rewrite selection",
      contexts: ["selection"],
    });
    chrome.contextMenus.create({
      id: "askai-simplify-selection",
      title: "Ask AI: Simplify selection",
      contexts: ["selection"],
    });
  });

  chrome.action.onClicked.addListener(async (tab) => {
    await openSidePanelForTab(tab);
  });

  chrome.commands.onCommand.addListener((command) => {
    void handleCommand(command);
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (!tab) {
      return;
    }

    const actionsByMenuId: Record<string, QuickActionId> = {
      "askai-summarize-page": "summarize",
      "askai-explain-selection": "explain",
      "askai-rewrite-selection": "rewrite",
      "askai-simplify-selection": "simplify",
    };
    const actionId = actionsByMenuId[String(info.menuItemId)];

    if (!actionId) {
      return;
    }

    void dispatchQuickAction(tab, actionId, info.selectionText);
  });

  chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    try {
      upsertTabSession(await chrome.tabs.get(tabId));
    } catch {
      // Ignore tabs that cannot be inspected.
    }
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!changeInfo.url && !changeInfo.title) {
      return;
    }

    upsertTabSession({ ...tab, id: tabId });
  });

  chrome.tabs.onRemoved.addListener(async (tabId) => {
    tabSessions.delete(tabId);
    try {
      await initializeDatabase();
      const repository = createTabSessionRepository();
      const existing = await repository.getByTabId(tabId);
      if (existing) {
        await repository.delete(existing.id);
      }
    } catch {
      // Database may not be initialized in this context; ignore.
    }
  });

  addChromeMessageListener(async (message, sender) => {
    if (sender.id !== chrome.runtime.id) {
      return undefined;
    }

    if (message.type === messageTypes.pageContextRequest) {
      if (sender.tab) {
        return createUnavailableResponse(
          undefined,
          "failed",
          "extraction-failed",
          "Page context can only be requested by the extension UI.",
        );
      }
      return requestPageContext(message.tabId, message.mode);
    }

    if (message.type === messageTypes.quickActionRequest && sender.tab?.id) {
      await dispatchQuickAction(sender.tab, message.actionId, message.focus);
      return undefined;
    }

    if (message.type === messageTypes.selectionChanged) {
      if (!sender.tab?.id) {
        return undefined;
      }
      const tabId = sender.tab.id;
      const session = tabSessions.has(tabId)
        ? tabSessions.get(tabId)
        : upsertTabSession(sender.tab);

      if (session) {
        session.selectionText = message.text;
        session.title = sender.tab.title ?? message.title;
        session.url = sender.tab.url ?? message.url;
        session.updatedAt = nowIso();
        return toTabSessionMessage(session);
      }
    }

    return undefined;
  });
});
