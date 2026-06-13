import {
  type AskAiSettings,
  buildQuickActionPrompt,
  type ChatMessageRecord,
  type ContextMode,
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
import { restoreActiveConversation, startNewConversation, streamChat } from "../src/sidepanel/chat";
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
  messages: ChatMessageRecord[];
  draft: string;
  error: string | null;
  isStreaming: boolean;
  pendingAction: PendingQuickAction | null;
  focusText: string | undefined;
  hintsSeen: boolean;
  abortController: AbortController | null;
  contextRequestId: number;
  headerInfoOpen: boolean;
  modelSelectorOpen: boolean;
  modelSelectorSearchTerm: string;
  modelSelectorActiveProviderId: ModelProviderId;
  setupDraft: SetupDraft | null;

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
  sendPrompt: (question: string, focus?: string) => Promise<boolean>;
  runQuickAction: (action: PendingQuickAction) => Promise<void>;
  selectModel: (modelId: InternalModelId) => Promise<void>;
  startFreshChat: () => Promise<void>;
  stopStreaming: () => void;
  completeSetup: (settings: AskAiSettings, status: ApiKeyStatus) => Promise<void>;
};

export const useSidepanelStore = create<SidepanelState>((set, get) => ({
  contextState: { status: "loading" },
  settings: null,
  apiKeyStatus: null,
  messages: [],
  draft: "",
  error: null,
  isStreaming: false,
  pendingAction: null,
  focusText: undefined,
  hintsSeen: true,
  abortController: null,
  contextRequestId: 0,
  headerInfoOpen: false,
  modelSelectorOpen: false,
  modelSelectorSearchTerm: "",
  modelSelectorActiveProviderId: "openai",
  setupDraft: null,

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
    set({ contextRequestId: requestId, contextState: { status: "loading" } });

    try {
      const tabId = await getActiveTabId();
      const restored = await restoreActiveConversation(tabId);

      if (get().contextRequestId !== requestId) {
        return;
      }

      set({ messages: restored.messages });

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

  sendPrompt: async (question, focus) => {
    const state = get();
    const trimmed = question.trim();

    if (!trimmed || state.contextState.status !== "available" || state.isStreaming) {
      return false;
    }

    const tabId = await getActiveTabId();
    const abortController = new AbortController();

    set({
      draft: "",
      error: null,
      isStreaming: true,
      abortController,
    });

    if (!state.hintsSeen) {
      set({ hintsSeen: true });
      void markUiHintsSeen().catch(() => undefined);
    }

    try {
      await streamChat({
        question: trimmed,
        pageContext: state.contextState.context,
        tabId,
        focus,
        signal: abortController.signal,
        onMessageUpdate: get().upsertMessage,
      });

      return true;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Chat request failed.";

      set({
        error: message,
      });

      return false;
    } finally {
      set({
        isStreaming: false,
        abortController: null,
      });
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
}));
