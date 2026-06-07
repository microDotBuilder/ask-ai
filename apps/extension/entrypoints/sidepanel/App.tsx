import {
  type AskAiSettings,
  buildQuickActionPrompt,
  type ChatMessageRecord,
  type ContextMode,
  defaultSettings,
  type InternalModelId,
  type ModelInfo,
  messageTypes,
  type PageContext,
  type PageContextResponseMessage,
  type ProviderId,
  type QuickActionRequestMessage,
  quickActionDefinitions,
} from "@askai/core";
import { ChevronDown, Copy, Info, Send, Sparkles, Square } from "lucide-react";
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import anthropicIconUrl from "../../../../assets/anthropic.svg";
import geminiIconUrl from "../../../../assets/gemenai.svg";
import infoIconUrl from "../../../../assets/icons/info.svg";
import newThreadIconUrl from "../../../../assets/icons/new_thread.svg";
import settingsIconUrl from "../../../../assets/icons/settings.svg";
import openAiIconUrl from "../../../../assets/openai.svg";
import { addChromeMessageListener, sendRuntimeMessage } from "../../src/chrome";
import {
  type ApiKeyStatus,
  loadSettings,
  modelsForSettings,
  type PendingQuickAction,
  readApiKeyStatus,
  requestHistoryPersistence,
  saveProviderApiKey,
  saveSettings,
  takePendingQuickAction,
  testProviderConnection,
} from "../../src/product";
import {
  restoreActiveConversation,
  startNewConversation,
  streamChat,
} from "../../src/sidepanel/chat";

type ContextState =
  | { status: "loading" }
  | { status: "available"; response: PageContextResponseMessage; context: PageContext }
  | {
      status: "blocked" | "unsupported" | "failed";
      response: Exclude<PageContextResponseMessage, { status: "available" }>;
    };

type ModelProviderId = "openai" | "gemini" | "anthropic";

interface ModelProvider {
  id: ModelProviderId;
  name: string;
  iconSrc: string;
  emptyTooltip?: string;
}

interface ModelProviderGroup extends ModelProvider {
  models: ModelInfo[];
}

const openAiModelProvider: ModelProvider = {
  id: "openai",
  name: "OpenAI",
  iconSrc: openAiIconUrl,
};

const fallbackModelProviderGroup: ModelProviderGroup = {
  ...openAiModelProvider,
  models: [],
};

const modelProviders: ModelProvider[] = [
  openAiModelProvider,
  {
    id: "gemini",
    name: "Gemini",
    iconSrc: geminiIconUrl,
  },
  {
    id: "anthropic",
    name: "Anthropic",
    iconSrc: anthropicIconUrl,
  },
];

async function getActiveTabId(): Promise<number | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

function contextStateFromResponse(response: PageContextResponseMessage): ContextState {
  if (response.status === "available") {
    return { status: "available", response, context: response.context };
  }

  return {
    status: response.status,
    response,
  };
}

function getVisibleSetupModels(providerId: ProviderId) {
  return defaultSettings
    ? modelsForSettings(defaultSettings).filter((model) => model.providerId === providerId)
    : [];
}

function getProviderDetails(providerId: ModelProviderId) {
  return modelProviders.find((provider) => provider.id === providerId) ?? openAiModelProvider;
}

function getModelProviderId(model: ModelInfo): ModelProviderId {
  const family = model.family.toLowerCase();
  const label = model.label.toLowerCase();
  const id = model.id.toLowerCase();
  const routedProvider = model.openRouterRoute?.routedProvider;

  if (routedProvider === "google" || family.includes("gemini") || label.includes("gemini")) {
    return "gemini";
  }

  if (
    routedProvider === "anthropic" ||
    family.includes("anthropic") ||
    label.includes("claude") ||
    id.includes("claude")
  ) {
    return "anthropic";
  }

  return "openai";
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat(undefined, {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function StatusBadge({ state }: { state: ContextState }) {
  const label = {
    available: "Context ready",
    blocked: "Context blocked",
    failed: "Context unavailable",
    loading: "Loading context",
    unsupported: "Unsupported page",
  }[state.status];

  return (
    <span className="status-badge" data-state={state.status}>
      {label}
    </span>
  );
}

function HeaderStatus({ state, isStreaming }: { state: ContextState; isStreaming: boolean }) {
  if (isStreaming) {
    return <p className="status-copy">Writing response...</p>;
  }

  if (state.status === "available") {
    return <p className="status-copy">Ready on {state.context.domain || "this tab"}</p>;
  }

  if (state.status === "loading") {
    return <p className="status-copy">Reading the active tab...</p>;
  }

  return <p className="status-copy status-copy-warning">{state.response.unavailable.message}</p>;
}

function MessageBubble({ message }: { message: ChatMessageRecord }) {
  const isAssistant = message.role === "assistant";

  return (
    <article className={`message-bubble ${message.role}`} data-status={message.status}>
      <div className="message-meta">
        <span>{isAssistant ? "Assistant" : "You"}</span>
        {isAssistant && message.content ? (
          <button
            aria-label="Copy response"
            className="copy-button"
            onClick={() => void navigator.clipboard.writeText(message.content)}
            type="button"
          >
            <Copy size={13} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <p>{message.content || (message.status === "streaming" ? "Thinking..." : "")}</p>
      {message.status === "streaming" ? <small>Streaming...</small> : null}
      {message.status === "cancelled" ? <small>Stopped.</small> : null}
      {message.error ? <small>{message.error.message}</small> : null}
    </article>
  );
}

function SetupPanel({
  settings,
  onComplete,
}: {
  settings: AskAiSettings;
  onComplete: (settings: AskAiSettings, status: ApiKeyStatus) => void;
}) {
  const [providerId, setProviderId] = useState<ProviderId>(settings.defaultProviderId);
  const [modelId, setModelId] = useState<InternalModelId>(settings.defaultModelId);
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const models = getVisibleSetupModels(providerId);

  useEffect(() => {
    const firstProviderModel = models.find((model) => model.internalId === modelId) ?? models[0];
    if (firstProviderModel) {
      setModelId(firstProviderModel.internalId);
    }
  }, [modelId, models]);

  const save = async () => {
    const trimmedKey = apiKey.trim();

    if (!trimmedKey) {
      setStatus("Enter an API key to continue.");
      return;
    }

    setBusy(true);
    setStatus("Testing provider connection...");

    const test = await testProviderConnection(providerId, trimmedKey);
    if (!test.ok) {
      setBusy(false);
      setStatus(test.message);
      return;
    }

    await saveProviderApiKey(providerId, trimmedKey);
    const nextSettings: AskAiSettings = {
      ...settings,
      defaultProviderId: providerId,
      defaultModelId: modelId,
    };
    await saveSettings(nextSettings);

    if (nextSettings.saveHistory) {
      await requestHistoryPersistence();
    }

    const nextStatus = await readApiKeyStatus();
    setBusy(false);
    onComplete(nextSettings, nextStatus);
  };

  return (
    <main className="setup-shell">
      <header className="setup-header">
        <Sparkles size={18} aria-hidden="true" />
        <div>
          <h1>Set up Ask AI</h1>
          <p>Connect a provider to start chatting with the current tab.</p>
        </div>
      </header>

      <section className="setup-card">
        <div>
          <h2>Bring your own API key</h2>
          <p>
            Ask AI stores your key encrypted in this browser and sends requests directly to the
            provider you choose.
          </p>
        </div>

        <label>
          <span>Provider</span>
          <select
            onChange={(event) => setProviderId(event.target.value as ProviderId)}
            value={providerId}
          >
            <option value="openai">OpenAI</option>
            <option value="openrouter">OpenRouter</option>
          </select>
        </label>

        <label>
          <span>API key</span>
          <input
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={providerId === "openai" ? "sk-..." : "sk-or-..."}
            type="password"
            value={apiKey}
          />
        </label>

        <label>
          <span>Default model</span>
          <select
            onChange={(event) => setModelId(event.target.value as InternalModelId)}
            value={modelId}
          >
            {models.map((model) => (
              <option key={model.internalId} value={model.internalId}>
                {model.label} - {model.family}
              </option>
            ))}
          </select>
        </label>

        {status ? <p className="setup-status">{status}</p> : null}

        <button
          className="primary-button"
          disabled={busy}
          onClick={() => void save()}
          type="button"
        >
          {busy ? "Checking..." : "Test and finish setup"}
        </button>
      </section>

      <button
        className="quiet-link-button"
        onClick={() => chrome.runtime.openOptionsPage()}
        type="button"
      >
        Open advanced settings
      </button>
    </main>
  );
}

function HeaderActions({
  contextSummary,
  contextState,
  disabledNewChat,
  onNewChat,
  onRefresh,
}: {
  contextSummary: ContextSummary | null;
  contextState: ContextState;
  disabledNewChat: boolean;
  onNewChat: () => void;
  onRefresh: () => void;
}) {
  const [infoOpen, setInfoOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!infoOpen) {
      return undefined;
    }

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) {
        return;
      }

      setInfoOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setInfoOpen(false);
      }
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [infoOpen]);

  return (
    <div ref={menuRef} className="header-actions">
      <div className="header-menu">
        <button
          aria-expanded={infoOpen}
          aria-haspopup="dialog"
          aria-label="Page info"
          className="header-icon-button"
          onClick={() => setInfoOpen((current) => !current)}
          title="Page info"
          type="button"
        >
          <img src={infoIconUrl} alt="" />
        </button>

        {infoOpen ? (
          <div className="header-popover page-popover" role="dialog" aria-label="Page info">
            <div>
              <p>Page</p>
              <strong>{contextSummary?.title ?? "Current tab"}</strong>
            </div>
            <div>
              <p>Domain</p>
              <strong>{contextSummary?.domain ?? "Unavailable"}</strong>
            </div>
            <div>
              <p>Status</p>
              <StatusBadge state={contextState} />
            </div>
            <button className="popover-action" onClick={onRefresh} type="button">
              Retry context
            </button>
          </div>
        ) : null}
      </div>

      <button
        aria-label="Open settings"
        className="header-icon-button"
        onClick={() => chrome.runtime.openOptionsPage()}
        title="Settings"
        type="button"
      >
        <img src={settingsIconUrl} alt="" />
      </button>

      <button
        aria-label="New chat"
        className="header-icon-button"
        disabled={disabledNewChat}
        onClick={onNewChat}
        title="New chat"
        type="button"
      >
        <img src={newThreadIconUrl} alt="" />
      </button>
    </div>
  );
}

function ModelSelector({
  disabled,
  favoriteModelIds,
  models,
  onModelChange,
  selectedModelId,
}: {
  disabled: boolean;
  favoriteModelIds: readonly InternalModelId[];
  models: ModelInfo[];
  onModelChange: (modelId: InternalModelId) => void;
  selectedModelId: InternalModelId;
}) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeProviderId, setActiveProviderId] = useState<ModelProviderId>("openai");
  const controlRef = useRef<HTMLElement | null>(null);
  const selectableModels = useMemo(() => models.filter((model) => model.internalId), [models]);
  const providerGroups = useMemo<ModelProviderGroup[]>(
    () =>
      modelProviders.map((provider) => ({
        ...provider,
        models: selectableModels.filter((model) => getModelProviderId(model) === provider.id),
      })),
    [selectableModels],
  );
  const selectedModel = selectableModels.find((model) => model.internalId === selectedModelId);
  const selectedProviderId = selectedModel
    ? getModelProviderId(selectedModel)
    : (providerGroups.find((provider) => provider.models.length)?.id ?? "openai");
  const activeProvider =
    providerGroups.find((provider) => provider.id === activeProviderId) ??
    providerGroups.find((provider) => provider.id === selectedProviderId) ??
    fallbackModelProviderGroup;
  const selectedProvider = selectedModel ? getProviderDetails(selectedProviderId) : undefined;
  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  const visibleModels = activeProvider.models.filter((model) => {
    const searchable = `${model.label} ${model.family} ${model.id}`.toLowerCase();
    return searchable.includes(normalizedSearchTerm);
  });
  const triggerDisabled = disabled || selectableModels.length === 0;

  useEffect(() => {
    if (!open) {
      setActiveProviderId(selectedProviderId);
      setSearchTerm("");
    }
  }, [open, selectedProviderId]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (controlRef.current?.contains(event.target as Node)) {
        return;
      }

      setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <section ref={controlRef} className="model-selector">
      <span id="model-selector-label" className="sr-only">
        Model
      </span>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-labelledby="model-selector-label model-selector-value"
        className="model-trigger"
        disabled={triggerDisabled}
        onClick={() => setOpen((currentOpen) => !currentOpen)}
        type="button"
      >
        {selectedProvider ? (
          <img className="model-trigger-icon" src={selectedProvider.iconSrc} alt="" />
        ) : null}
        <span id="model-selector-value">{selectedModel?.label ?? "Select model"}</span>
        <ChevronDown className="model-trigger-chevron" size={13} aria-hidden="true" />
      </button>

      {open ? (
        <div className="model-popover" role="dialog" aria-label="Choose model">
          <div className="model-provider-rail" role="tablist" aria-label="Companies">
            {providerGroups.map((provider) => {
              const emptyProvider = provider.models.length === 0;
              const tooltip = emptyProvider
                ? (provider.emptyTooltip ?? "Models coming soon")
                : provider.name;

              return (
                <button
                  aria-disabled={emptyProvider}
                  aria-selected={provider.id === activeProvider.id}
                  className="model-provider-tab"
                  data-active={provider.id === activeProvider.id}
                  data-empty={emptyProvider}
                  data-tooltip={tooltip}
                  key={provider.id}
                  onClick={() => {
                    if (!emptyProvider) {
                      setActiveProviderId(provider.id);
                      setSearchTerm("");
                    }
                  }}
                  role="tab"
                  title={tooltip}
                  type="button"
                >
                  <img src={provider.iconSrc} alt="" />
                  <span className="sr-only">{provider.name}</span>
                </button>
              );
            })}
          </div>

          <div className="model-options-pane">
            <label className="model-search">
              <span className="model-search-icon" aria-hidden="true" />
              <span className="sr-only">Search models</span>
              <input
                disabled={!activeProvider.models.length}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search models..."
                type="search"
                value={searchTerm}
              />
            </label>

            <div
              className="model-option-list"
              role="listbox"
              aria-label={`${activeProvider.name} models`}
            >
              {activeProvider.models.length ? (
                visibleModels.length ? (
                  visibleModels.map((model, index) => {
                    const favorite = favoriteModelIds.includes(model.internalId);
                    const selected = model.internalId === selectedModelId;

                    return (
                      <button
                        aria-selected={selected}
                        className="model-option-row"
                        data-selected={selected}
                        disabled={!model.isAvailable}
                        key={model.internalId}
                        onClick={() => {
                          onModelChange(model.internalId);
                          setOpen(false);
                        }}
                        role="option"
                        type="button"
                      >
                        <span
                          className="model-favorite"
                          data-favorite={favorite}
                          aria-hidden="true"
                        />
                        <span className="model-option-copy">
                          <strong>{model.label}</strong>
                          <small>
                            <img src={activeProvider.iconSrc} alt="" />
                            {activeProvider.name}
                          </small>
                        </span>
                        <span className="model-shortcut" aria-hidden="true">
                          #{index + 1}
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <p className="model-empty-state">No matching models.</p>
                )
              ) : (
                <div className="model-coming-soon" role="status">
                  <strong>{activeProvider.name}</strong>
                  <span>Models coming soon.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function TokenUsageMeter({ draft, model }: { draft: string; model?: ModelInfo }) {
  const estimatedTokens = Math.ceil(draft.trim().length / 4);
  const percentUsed = model?.contextWindow
    ? Math.min(99, Math.round((estimatedTokens / model.contextWindow) * 100))
    : 0;
  const title = model?.contextWindow
    ? `Estimated ${formatCompactNumber(estimatedTokens)} of ${formatCompactNumber(
        model.contextWindow,
      )} input tokens`
    : `Estimated ${formatCompactNumber(estimatedTokens)} input tokens`;

  return (
    <div
      className="token-meter"
      style={{ "--token-percent": `${percentUsed}` } as CSSProperties}
      title={title}
    >
      <span>{percentUsed}</span>
      <span className="sr-only">{title}</span>
    </div>
  );
}

type ContextSummary = {
  title: string;
  domain: string;
  characterCount: string;
  blocks: string;
  truncated: boolean;
};

export function App() {
  const [contextState, setContextState] = useState<ContextState>({ status: "loading" });
  const [settings, setSettings] = useState<AskAiSettings | null>(null);
  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatus | null>(null);
  const [messages, setMessages] = useState<ChatMessageRecord[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingQuickAction | null>(null);
  const [focusText, setFocusText] = useState<string | undefined>();
  const abortControllerRef = useRef<AbortController | null>(null);

  const setupRequired =
    settings !== null && apiKeyStatus !== null && !apiKeyStatus[settings.defaultProviderId];

  const upsertMessage = useCallback((message: ChatMessageRecord) => {
    setMessages((current) => {
      const index = current.findIndex((item) => item.id === message.id);

      if (index === -1) {
        return [...current, message];
      }

      const next = [...current];
      next[index] = message;
      return next;
    });
  }, []);

  const requestContext = useCallback(async (mode: ContextMode = "full-page") => {
    setContextState({ status: "loading" });

    try {
      const tabId = await getActiveTabId();
      const restored = await restoreActiveConversation(tabId);
      setMessages(restored.messages);

      const response = await sendRuntimeMessage({
        type: messageTypes.pageContextRequest,
        tabId,
        mode,
      });

      setContextState(contextStateFromResponse(response));
    } catch {
      setContextState({
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
      });
    }
  }, []);

  const refreshProductState = useCallback(async () => {
    const [nextSettings, nextApiKeyStatus, storedAction] = await Promise.all([
      loadSettings(),
      readApiKeyStatus(),
      takePendingQuickAction(),
    ]);
    setSettings(nextSettings);
    setApiKeyStatus(nextApiKeyStatus);

    if (storedAction) {
      setPendingAction(storedAction);
      setFocusText(storedAction.focus);
      await requestContext(storedAction.mode ?? "full-page");
      return;
    }

    await requestContext();
  }, [requestContext]);

  const sendPrompt = useCallback(
    async (question: string, focus?: string) => {
      const trimmed = question.trim();

      if (!trimmed || contextState.status !== "available" || isStreaming) {
        return false;
      }

      const tabId = await getActiveTabId();
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      setDraft("");
      setError(null);
      setIsStreaming(true);

      try {
        await streamChat({
          question: trimmed,
          pageContext: contextState.context,
          tabId,
          focus,
          signal: abortController.signal,
          onMessageUpdate: upsertMessage,
        });
        return true;
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "Chat request failed.";
        setError(message);
        return false;
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [contextState, isStreaming, upsertMessage],
  );

  const runQuickAction = useCallback(
    async (action: PendingQuickAction) => {
      const prompt = buildQuickActionPrompt(action.actionId, action.focus);
      const sent = await sendPrompt(prompt, action.focus);

      if (sent) {
        setPendingAction(null);
      }
    },
    [sendPrompt],
  );

  useEffect(() => {
    void refreshProductState();
  }, [refreshProductState]);

  useEffect(() => {
    if (pendingAction && contextState.status === "available" && !isStreaming) {
      void runQuickAction(pendingAction);
    }
  }, [contextState, isStreaming, pendingAction, runQuickAction]);

  useEffect(() => {
    return addChromeMessageListener((message) => {
      if (message.type === messageTypes.quickActionRequest) {
        const quickAction = message as QuickActionRequestMessage;
        const nextAction: PendingQuickAction = {
          actionId: quickAction.actionId,
          tabId: quickAction.tabId,
          focus: quickAction.focus,
          mode: quickAction.mode,
          createdAt: new Date().toISOString(),
        };
        setPendingAction(nextAction);
        setFocusText(nextAction.focus);
        void requestContext(nextAction.mode ?? "full-page");
      }

      return undefined;
    });
  }, [requestContext]);

  const contextSummary = useMemo<ContextSummary | null>(() => {
    if (contextState.status !== "available") {
      return null;
    }

    const context = contextState.context;

    return {
      title: context.title || "Untitled page",
      domain: context.domain,
      characterCount: context.metrics.characterCount.toLocaleString(),
      blocks: [
        `${context.metrics.headingCount} headings`,
        `${context.metrics.paragraphCount} paragraphs`,
        `${context.metrics.listCount} list items`,
      ].join(" / "),
      truncated: context.truncated,
    };
  }, [contextState]);

  const visibleModels = settings ? modelsForSettings(settings) : [];
  const selectedModel = visibleModels.find(
    (model) => model.internalId === settings?.defaultModelId,
  );
  const canSend = contextState.status === "available" && draft.trim().length > 0 && !isStreaming;

  const selectModel = useCallback(
    (modelId: InternalModelId) => {
      if (!settings) {
        return;
      }

      const model = visibleModels.find((item) => item.internalId === modelId);
      if (!model) {
        return;
      }

      const nextSettings = {
        ...settings,
        defaultProviderId: model.providerId,
        defaultModelId: model.internalId,
      };
      setSettings(nextSettings);
      void saveSettings(nextSettings);
    },
    [settings, visibleModels],
  );

  const startFreshChat = useCallback(async () => {
    if (isStreaming) {
      return;
    }

    const tabId = await getActiveTabId();
    await startNewConversation(tabId);
    setMessages([]);
    setDraft("");
    setError(null);
  }, [isStreaming]);

  if (!settings || !apiKeyStatus) {
    return (
      <main className="sidepanel-loading">
        <p>Loading Ask AI...</p>
      </main>
    );
  }

  if (setupRequired) {
    return (
      <SetupPanel
        settings={settings}
        onComplete={(nextSettings, nextStatus) => {
          setSettings(nextSettings);
          setApiKeyStatus(nextStatus);
          void requestContext();
        }}
      />
    );
  }

  return (
    <main className="sidepanel-shell">
      <header className="app-header">
        <div className="app-title">
          <h1>Ask AI</h1>
          <HeaderStatus state={contextState} isStreaming={isStreaming} />
        </div>
        <HeaderActions
          contextSummary={contextSummary}
          contextState={contextState}
          disabledNewChat={isStreaming}
          onNewChat={() => void startFreshChat()}
          onRefresh={() => void requestContext()}
        />
      </header>

      <section className="workspace-panel" aria-live="polite">
        <div className="context-strip">
          <div className="context-copy">
            <span>Current tab</span>
            <strong>{contextSummary?.title ?? "Waiting for page context"}</strong>
            {contextSummary ? (
              <small>
                {contextSummary.domain} / {contextSummary.characterCount} characters /{" "}
                {contextSummary.blocks}
              </small>
            ) : null}
          </div>
          <StatusBadge state={contextState} />
        </div>

        {focusText ? (
          <p className="selection-preview">
            <span>Selection</span>
            {focusText}
          </p>
        ) : null}

        {contextSummary?.truncated ? (
          <p className="context-note">Long page context was truncated.</p>
        ) : null}

        {contextState.status !== "loading" && contextState.status !== "available" ? (
          <div className="context-unavailable">
            <Info size={16} aria-hidden="true" />
            <p>{contextState.response.unavailable.message}</p>
          </div>
        ) : null}

        <div className="chat-scroll">
          {messages.length === 0 ? (
            <div className="welcome-state">
              <p>Hello</p>
              <h2>How can I help you today?</h2>
            </div>
          ) : null}

          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
        </div>
      </section>

      <section className="composer-zone">
        <div className="quick-actions">
          {quickActionDefinitions.map((action) => (
            <button
              disabled={contextState.status !== "available" || isStreaming}
              key={action.id}
              onClick={() =>
                void sendPrompt(buildQuickActionPrompt(action.id, focusText), focusText)
              }
              type="button"
            >
              {action.label}
            </button>
          ))}
        </div>

        {error ? <div className="error-banner">{error}</div> : null}

        <form
          className="chat-form"
          onSubmit={(event) => {
            event.preventDefault();
            void sendPrompt(draft, focusText);
          }}
        >
          <textarea
            disabled={contextState.status !== "available"}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={
              contextState.status === "available"
                ? "Ask for follow-up changes or attach images"
                : "Page context is unavailable"
            }
            rows={3}
            value={draft}
          />
          <div className="composer-footer">
            <div className="composer-tools">
              <ModelSelector
                disabled={isStreaming}
                favoriteModelIds={settings.favoriteModelIds}
                models={visibleModels}
                onModelChange={selectModel}
                selectedModelId={settings.defaultModelId}
              />
              <button className="context-pill" disabled type="button">
                <Sparkles size={14} aria-hidden="true" />
                <span>{contextState.status === "available" ? "Full page" : "No page"}</span>
              </button>
            </div>

            <TokenUsageMeter draft={draft} model={selectedModel} />

            <button
              aria-label={isStreaming ? "Stop response" : "Send"}
              className="send-button"
              data-streaming={isStreaming}
              disabled={isStreaming ? false : !canSend}
              onClick={isStreaming ? () => abortControllerRef.current?.abort() : undefined}
              type={isStreaming ? "button" : "submit"}
            >
              {isStreaming ? (
                <Square size={15} fill="currentColor" aria-hidden="true" />
              ) : (
                <Send size={16} aria-hidden="true" />
              )}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
