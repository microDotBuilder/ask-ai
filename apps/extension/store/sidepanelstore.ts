import {
  type AskAiSettings,
  buildQuickActionPrompt,
  type ChatMessageRecord,
  type ContextMode,
  type ConversationRecord,
  type InternalModelId,
  messageTypes,
  type ProviderId,
} from "@askai/core";
import { create } from "zustand";
import { sendRuntimeMessage } from "../src/chrome";
import {
  type ApiKeyStatus,
  clearPendingQuickAction,
  loadSettings,
  markUiHintsSeen,
  modelsForSettings,
  type PendingQuickAction,
  readApiKeyStatus,
  readUiHintsSeen,
  requestHistoryPersistence,
  saveProviderApiKey,
  saveSettings,
  takePendingQuickAction,
  testProviderConnection,
} from "../src/product";
import {
  restoreActiveConversation,
  restoreConversationById,
  setActiveSibling,
  startNewConversation,
  streamChat,
} from "../src/sidepanel/chat";
import {
  clearAllHistory,
  deleteHistoryEntry,
  type HistoryEntry,
  loadHistoryEntries,
} from "../src/sidepanel/history";
import {
  type ContextState,
  contextStateFromResponse,
  type ModelProviderId,
} from "../src/types/types";
import { getActiveTabId } from "../src/utils/misc";

type SetupDraft = {
  providerId: ProviderId;
  modelId: InternalModelId;
  apiKey: string;
  status: string | null;
  busy: boolean;
};

type SidepanelState = {
  contextState: ContextState;
  settings: AskAiSettings | null;
  apiKeyStatus: ApiKeyStatus | null;
  conversation: ConversationRecord | null;
  messages: ChatMessageRecord[];
  draft: string;
  error: string | null;
  isStreaming: boolean;
  pendingAction: PendingQuickAction | null;
  focusText: string | undefined;
  hintsSeen: boolean;
  abortController: AbortController | null;
  contextRequestId: number;
  streamGeneration: number;
  activeTabId: number | undefined;
  headerInfoOpen: boolean;
  modelSelectorOpen: boolean;
  modelSelectorSearchTerm: string;
  modelSelectorActiveProviderId: ModelProviderId;
  setupDraft: SetupDraft | null;
  historyOpen: boolean;
  historyEntries: HistoryEntry[] | null;
  historyLoading: boolean;
  historyQuery: string;

  setDraft: (draft: string) => void;
  setSettings: (settings: AskAiSettings | null) => void;
  setApiKeyStatus: (status: ApiKeyStatus | null) => void;
  setPendingAction: (action: PendingQuickAction | null) => void;
  setFocusText: (text: string | undefined) => void;
  setHeaderInfoOpen: (open: boolean) => void;
  setModelSelectorOpen: (open: boolean) => void;
  setModelSelectorSearchTerm: (searchTerm: string) => void;
  setModelSelectorActiveProviderId: (providerId: ModelProviderId) => void;
  initializeSetupDraft: (settings: AskAiSettings) => void;
  setSetupProviderId: (providerId: ProviderId) => void;
  setSetupModelId: (modelId: InternalModelId) => void;
  setSetupApiKey: (apiKey: string) => void;
  submitSetup: (settings: AskAiSettings) => Promise<void>;

  upsertMessage: (message: ChatMessageRecord) => void;
  requestContext: (mode?: ContextMode) => Promise<void>;
  refreshProductState: () => Promise<void>;
  receiveQuickAction: (action: PendingQuickAction) => Promise<void>;
  sendPrompt: (
    question: string,
    focus?: string,
    override?: { providerId: ProviderId; modelId: InternalModelId },
  ) => Promise<boolean>;
  retryMessage: (
    userMessageId: string,
    override?: { providerId: ProviderId; modelId: InternalModelId },
  ) => Promise<boolean>;
  editMessage: (
    newContent: string,
    override?: { providerId: ProviderId; modelId: InternalModelId },
  ) => Promise<boolean>;
  navigateSibling: (targetMessageId: string) => Promise<void>;
  runQuickAction: (action: PendingQuickAction) => Promise<void>;
  selectModel: (modelId: InternalModelId) => Promise<void>;
  startFreshChat: () => Promise<void>;
  stopStreaming: () => void;
  completeSetup: (settings: AskAiSettings, status: ApiKeyStatus) => Promise<void>;
  openHistory: () => Promise<void>;
  closeHistory: () => void;
  setHistoryQuery: (query: string) => void;
  openConversation: (conversationId: string) => Promise<void>;
  deleteConversation: (conversationId: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  rebindToActiveTab: () => Promise<void>;
};

export const useSidepanelStore = create<SidepanelState>((set, get) => ({
  contextState: { status: "loading" },
  settings: null,
  apiKeyStatus: null,
  conversation: null,
  messages: [],
  draft: "",
  error: null,
  isStreaming: false,
  pendingAction: null,
  focusText: undefined,
  hintsSeen: true,
  abortController: null,
  contextRequestId: 0,
  streamGeneration: 0,
  activeTabId: undefined,
  headerInfoOpen: false,
  modelSelectorOpen: false,
  modelSelectorSearchTerm: "",
  modelSelectorActiveProviderId: "openai",
  setupDraft: null,
  historyOpen: false,
  historyEntries: null,
  historyLoading: false,
  historyQuery: "",

  setDraft: (draft) => set({ draft }),

  setSettings: (settings) => set({ settings }),

  setApiKeyStatus: (apiKeyStatus) => set({ apiKeyStatus }),

  setPendingAction: (pendingAction) => set({ pendingAction }),

  setFocusText: (focusText) => set({ focusText }),

  setHeaderInfoOpen: (headerInfoOpen) => set({ headerInfoOpen }),

  setModelSelectorOpen: (modelSelectorOpen) => set({ modelSelectorOpen }),

  setModelSelectorSearchTerm: (modelSelectorSearchTerm) => set({ modelSelectorSearchTerm }),

  setModelSelectorActiveProviderId: (modelSelectorActiveProviderId) =>
    set({ modelSelectorActiveProviderId }),

  initializeSetupDraft: (settings) => {
    if (get().setupDraft) {
      return;
    }

    set({
      setupDraft: {
        providerId: settings.defaultProviderId,
        modelId: settings.defaultModelId,
        apiKey: "",
        status: null,
        busy: false,
      },
    });
  },

  setSetupProviderId: (providerId) =>
    set((state) => ({
      setupDraft: state.setupDraft
        ? {
            ...state.setupDraft,
            providerId,
            status: null,
          }
        : null,
    })),

  setSetupModelId: (modelId) =>
    set((state) => ({
      setupDraft: state.setupDraft
        ? {
            ...state.setupDraft,
            modelId,
          }
        : null,
    })),

  setSetupApiKey: (apiKey) =>
    set((state) => ({
      setupDraft: state.setupDraft
        ? {
            ...state.setupDraft,
            apiKey,
            status: null,
          }
        : null,
    })),

  submitSetup: async (settings) => {
    const draft =
      get().setupDraft ??
      ({
        providerId: settings.defaultProviderId,
        modelId: settings.defaultModelId,
        apiKey: "",
        status: null,
        busy: false,
      } satisfies SetupDraft);
    const trimmedKey = draft.apiKey.trim();

    if (!trimmedKey) {
      set({
        setupDraft: {
          ...draft,
          status: "Enter an API key to continue.",
          busy: false,
        },
      });
      return;
    }

    set({
      setupDraft: {
        ...draft,
        status: "Testing provider connection...",
        busy: true,
      },
    });

    try {
      const test = await testProviderConnection(draft.providerId, trimmedKey);
      if (!test.ok) {
        set({
          setupDraft: {
            ...draft,
            status: test.message,
            busy: false,
          },
        });
        return;
      }

      await saveProviderApiKey(draft.providerId, trimmedKey);

      const nextSettings: AskAiSettings = {
        ...settings,
        defaultProviderId: draft.providerId,
        defaultModelId: draft.modelId,
      };

      await saveSettings(nextSettings);

      if (nextSettings.saveHistory) {
        await requestHistoryPersistence();
      }

      const nextStatus = await readApiKeyStatus();

      set({
        setupDraft: {
          ...draft,
          apiKey: "",
          status: test.message,
          busy: false,
        },
      });

      await get().completeSetup(nextSettings, nextStatus);
    } catch (caught) {
      set({
        setupDraft: {
          ...draft,
          status: caught instanceof Error ? caught.message : "Setup failed.",
          busy: false,
        },
      });
    }
  },

  upsertMessage: (message) => {
    set((state) => {
      const index = state.messages.findIndex((item) => item.id === message.id);

      if (index === -1) {
        return {
          messages: [...state.messages, message],
        };
      }

      const next = [...state.messages];
      next[index] = message;

      return {
        messages: next,
      };
    });
  },

  requestContext: async (mode = "full-page") => {
    const requestId = get().contextRequestId + 1;
    set({
      contextRequestId: requestId,
      contextState: { status: "loading" },
      streamGeneration: get().streamGeneration + 1,
    });

    try {
      const tabId = await getActiveTabId();
      const restored = await restoreActiveConversation(tabId);

      if (get().contextRequestId !== requestId) {
        return;
      }

      set({
        activeTabId: tabId,
        messages: restored.messages,
        conversation: restored.conversation ?? null,
      });

      const response = await sendRuntimeMessage({
        type: messageTypes.pageContextRequest,
        tabId,
        mode,
      });

      if (get().contextRequestId !== requestId) {
        return;
      }

      const nextContextState = contextStateFromResponse(response);

      set((state) => ({
        contextState: nextContextState,
        pendingAction:
          state.pendingAction && nextContextState.status !== "available"
            ? null
            : state.pendingAction,
      }));
    } catch {
      if (get().contextRequestId !== requestId) {
        return;
      }

      set({
        pendingAction: null,
        contextState: {
          status: "failed",
          response: {
            type: messageTypes.pageContextResponse,
            status: "failed",
            unavailable: {
              availability: "failed",
              reason: "content-script-unavailable",
              message: "Ask AI could not request context for this tab.",
            },
          },
        },
      });
    }
  },

  rebindToActiveTab: async () => {
    const state = get();
    state.abortController?.abort();
    set({
      abortController: null,
      isStreaming: false,
      conversation: null,
      messages: [],
      focusText: undefined,
      draft: "",
      error: null,
      pendingAction: null,
      streamGeneration: state.streamGeneration + 1,
    });
    await get().requestContext();
  },

  refreshProductState: async () => {
    const [nextSettings, nextApiKeyStatus, storedAction, hintsSeen] = await Promise.all([
      loadSettings(),
      readApiKeyStatus(),
      takePendingQuickAction(),
      readUiHintsSeen(),
    ]);

    set({
      settings: nextSettings,
      apiKeyStatus: nextApiKeyStatus,
      hintsSeen,
    });

    if (storedAction) {
      set({
        pendingAction: storedAction,
        focusText: storedAction.focus,
      });

      await get().requestContext(storedAction.mode ?? "full-page");
      return;
    }

    await get().requestContext();
  },

  receiveQuickAction: async (action) => {
    set({
      pendingAction: action,
      focusText: action.focus,
    });

    await clearPendingQuickAction().catch(() => undefined);
    await get().requestContext(action.mode ?? "full-page");
  },

  sendPrompt: async (question, focus, override) => {
    const state = get();
    const trimmed = question.trim();

    if (!trimmed || state.contextState.status !== "available" || state.isStreaming) {
      return false;
    }

    const tabId = await getActiveTabId();
    if (tabId === undefined) {
      set({ error: "No active tab is available." });
      return false;
    }

    if (state.activeTabId !== undefined && state.activeTabId !== tabId) {
      set({ error: "Active tab changed — refreshing context." });
      void get().rebindToActiveTab();
      return false;
    }

    const cachedContext = state.contextState.context;
    let freshResponse: Awaited<ReturnType<typeof sendRuntimeMessage>> | null = null;
    try {
      freshResponse = await sendRuntimeMessage({
        type: messageTypes.pageContextRequest,
        tabId,
        mode: cachedContext.mode,
      });
    } catch {
      set({ error: "Could not verify the active tab before sending." });
      return false;
    }

    const freshContextState = contextStateFromResponse(freshResponse);
    if (freshContextState.status !== "available") {
      set({
        contextState: freshContextState,
        error:
          freshContextState.status === "blocked"
            ? "This page is now restricted — message not sent."
            : "Page context is unavailable.",
      });
      return false;
    }

    if (freshContextState.context.url !== cachedContext.url) {
      set({
        contextState: freshContextState,
        error: "The page changed — review the new context and resend.",
      });
      return false;
    }

    const abortController = new AbortController();
    const generation = state.streamGeneration + 1;

    set({
      draft: "",
      error: null,
      isStreaming: true,
      abortController,
      streamGeneration: generation,
      contextState: freshContextState,
    });

    if (!state.hintsSeen) {
      set({ hintsSeen: true });
      void markUiHintsSeen().catch(() => undefined);
    }

    const onMessageUpdate = (message: ChatMessageRecord) => {
      if (get().streamGeneration !== generation) {
        return;
      }
      get().upsertMessage(message);
    };
    const onConversationReady = (conversation: ConversationRecord) => {
      if (get().streamGeneration !== generation) {
        return;
      }
      set({ conversation });
    };

    try {
      await streamChat({
        question: trimmed,
        pageContext: freshContextState.context,
        tabId,
        focus,
        signal: abortController.signal,
        onMessageUpdate,
        onConversationReady,
        providerOverride: override,
        transientConversation: state.conversation,
        transientMessages: state.messages,
      });
      return true;
    } catch (caught) {
      if (get().streamGeneration !== generation) {
        return false;
      }
      const message = caught instanceof Error ? caught.message : "Chat request failed.";

      set({
        error: message,
      });

      return false;
    } finally {
      if (get().streamGeneration === generation) {
        set({
          isStreaming: false,
          abortController: null,
        });
      }
    }
  },

  retryMessage: async (userMessageId, override) => {
    const target = get().messages.find((message) => message.id === userMessageId);
    if (target?.role !== "user") {
      return false;
    }
    return get().sendPrompt(target.content, get().focusText, override);
  },

  editMessage: async (newContent, override) => {
    const trimmed = newContent.trim();
    if (!trimmed) {
      return false;
    }
    return get().sendPrompt(trimmed, get().focusText, override);
  },

  navigateSibling: async (targetMessageId) => {
    if (get().isStreaming) {
      return;
    }
    const tabId = await getActiveTabId();
    try {
      const restored = await setActiveSibling(tabId, targetMessageId);
      set({
        conversation: restored.conversation ?? get().conversation,
        messages: restored.messages,
        error: null,
      });
    } catch (caught) {
      set({ error: caught instanceof Error ? caught.message : "Switch failed." });
    }
  },

  runQuickAction: async (action) => {
    set({
      pendingAction: null,
    });

    const prompt = buildQuickActionPrompt(action.actionId, action.focus);
    await get().sendPrompt(prompt, action.focus);
  },

  selectModel: async (modelId) => {
    const { settings } = get();

    if (!settings) {
      return;
    }

    const visibleModels = modelsForSettings(settings);
    const model = visibleModels.find((item) => item.internalId === modelId);

    if (!model) {
      return;
    }

    const nextSettings = {
      ...settings,
      defaultProviderId: model.providerId,
      defaultModelId: model.internalId,
    };

    set({
      settings: nextSettings,
    });

    await saveSettings(nextSettings);
  },

  startFreshChat: async () => {
    const { isStreaming } = get();

    if (isStreaming) {
      return;
    }

    const tabId = await getActiveTabId();

    await startNewConversation(tabId);

    set({
      conversation: null,
      messages: [],
      draft: "",
      error: null,
    });
  },

  stopStreaming: () => {
    get().abortController?.abort();
  },

  completeSetup: async (settings, apiKeyStatus) => {
    set({
      settings,
      apiKeyStatus,
      setupDraft: null,
    });

    await get().requestContext();
  },

  openHistory: async () => {
    const state = get();
    if (state.historyOpen) {
      return;
    }

    set({ historyOpen: true, historyQuery: "" });

    if (state.historyEntries !== null || state.historyLoading) {
      return;
    }

    set({ historyLoading: true });

    const currentDomain =
      state.contextState.status === "available" ? state.contextState.context.domain : undefined;

    try {
      const entries = await loadHistoryEntries(currentDomain);
      set({ historyEntries: entries, historyLoading: false });
    } catch {
      set({ historyEntries: [], historyLoading: false });
    }
  },

  closeHistory: () => {
    set({ historyOpen: false, historyQuery: "" });
  },

  setHistoryQuery: (historyQuery) => set({ historyQuery }),

  openConversation: async (conversationId) => {
    const state = get();
    if (state.isStreaming) {
      return;
    }

    const tabId = await getActiveTabId();
    if (tabId === undefined) {
      set({ error: "Active tab is unavailable." });
      return;
    }

    set({ historyOpen: false, historyQuery: "" });

    try {
      const restored = await restoreConversationById(tabId, conversationId);
      set({
        conversation: restored.conversation ?? null,
        messages: restored.messages,
        draft: "",
        error: null,
        historyEntries: null,
      });
    } catch (caught) {
      set({
        error: caught instanceof Error ? caught.message : "Could not open conversation.",
      });
    }
  },

  deleteConversation: async (conversationId) => {
    try {
      await deleteHistoryEntry(conversationId);
    } catch (caught) {
      set({ error: caught instanceof Error ? caught.message : "Could not delete conversation." });
      return;
    }

    set((state) => {
      const remaining = state.historyEntries
        ? state.historyEntries.filter((entry) => entry.id !== conversationId)
        : state.historyEntries;
      const isCurrent = state.conversation?.id === conversationId;
      return {
        historyEntries: remaining,
        conversation: isCurrent ? null : state.conversation,
        messages: isCurrent ? [] : state.messages,
      };
    });
  },

  clearHistory: async () => {
    try {
      await clearAllHistory();
    } catch (caught) {
      set({ error: caught instanceof Error ? caught.message : "Could not clear history." });
      return;
    }

    set({
      historyEntries: [],
      conversation: null,
      messages: [],
    });
  },
}));
