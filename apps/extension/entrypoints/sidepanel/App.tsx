import {
  buildQuickActionPrompt,
  messageTypes,
  type QuickActionRequestMessage,
  quickActionDefinitions,
  walkActivePath,
} from "@askai/core";
import { ArrowDown, Info, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addChromeMessageListener } from "../../src/chrome";
import { modelsForSettings, type PendingQuickAction } from "../../src/product";
import type { ContextSummary } from "../../src/types/types";
import { StatusBadge } from "../../src/ui/components/statusBadge";
import { HeaderActions } from "../../src/ui/headerAction";
import { HeaderStatus } from "../../src/ui/headerstatus";
import { InputContainer } from "../../src/ui/inputForm";
import { MessageBubble } from "../../src/ui/messageBubble";
import { SetupPanel } from "../../src/ui/setUpPannel";
import { useSidepanelStore } from "../../store/sidepanelstore";

const scrollPinThresholdPx = 56;

export function App() {
  const contextState = useSidepanelStore((state) => state.contextState);
  const settings = useSidepanelStore((state) => state.settings);
  const apiKeyStatus = useSidepanelStore((state) => state.apiKeyStatus);
  const messages = useSidepanelStore((state) => state.messages);
  const conversation = useSidepanelStore((state) => state.conversation);
  const draft = useSidepanelStore((state) => state.draft);
  const error = useSidepanelStore((state) => state.error);
  const isStreaming = useSidepanelStore((state) => state.isStreaming);
  const pendingAction = useSidepanelStore((state) => state.pendingAction);
  const focusText = useSidepanelStore((state) => state.focusText);
  const hintsSeen = useSidepanelStore((state) => state.hintsSeen);
  const setDraft = useSidepanelStore((state) => state.setDraft);
  const refreshProductState = useSidepanelStore((state) => state.refreshProductState);
  const requestContext = useSidepanelStore((state) => state.requestContext);
  const receiveQuickAction = useSidepanelStore((state) => state.receiveQuickAction);
  const sendPrompt = useSidepanelStore((state) => state.sendPrompt);
  const runQuickAction = useSidepanelStore((state) => state.runQuickAction);
  const selectModel = useSidepanelStore((state) => state.selectModel);
  const startFreshChat = useSidepanelStore((state) => state.startFreshChat);
  const stopStreaming = useSidepanelStore((state) => state.stopStreaming);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedToBottomRef = useRef(true);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const setupRequired =
    settings !== null && apiKeyStatus !== null && !apiKeyStatus[settings.defaultProviderId];
  const showFirstRunHints = !hintsSeen;

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
        void receiveQuickAction(nextAction);
      }

      return undefined;
    });
  }, [receiveQuickAction]);

  const scrollToBottom = useCallback(() => {
    const container = scrollRef.current;
    if (!container) {
      return;
    }

    container.scrollTop = container.scrollHeight;
    pinnedToBottomRef.current = true;
    setShowScrollToBottom(false);
  }, []);

  const handleChatScroll = useCallback(() => {
    const container = scrollRef.current;
    if (!container) {
      return;
    }

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    const pinned = distanceFromBottom < scrollPinThresholdPx;
    pinnedToBottomRef.current = pinned;
    setShowScrollToBottom(!pinned);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: keep the chat pinned to the bottom on every message/stream update
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) {
      return;
    }

    if (container.scrollHeight <= container.clientHeight) {
      pinnedToBottomRef.current = true;
      setShowScrollToBottom(false);
      return;
    }

    if (pinnedToBottomRef.current) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  const activePathResult = useMemo(
    () => walkActivePath(conversation ?? undefined, messages),
    [conversation, messages],
  );
  const visibleMessages = activePathResult.path;
  const siblingsMap = activePathResult.siblings;

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

  if (!settings || !apiKeyStatus) {
    return (
      <main className="sidepanel-loading">
        <p>Loading Ask AI...</p>
      </main>
    );
  }

  if (setupRequired) {
    return <SetupPanel settings={settings} />;
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

      {showFirstRunHints ? (
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
      ) : null}

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

      <section className="chat-area">
        <div className="chat-scroll" onScroll={handleChatScroll} ref={scrollRef}>
          <div aria-live="polite" className="chat-stream">
            {visibleMessages.length === 0 ? (
              <div className="welcome-state">
                <div className="welcome-icon">
                  <Sparkles size={18} aria-hidden="true" />
                </div>
                <h2>How can I help with this page?</h2>
                <p className="welcome-page">
                  {contextSummary?.title ?? "Waiting for page context"}
                </p>
              </div>
            ) : null}

            {visibleMessages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                siblingInfo={siblingsMap.get(message.id)}
              />
            ))}
          </div>

          <div className="composer-overlay">
            {showScrollToBottom ? (
              <button
                aria-label="Scroll to latest message"
                className="jump-to-bottom"
                onClick={scrollToBottom}
                type="button"
              >
                <ArrowDown size={16} aria-hidden="true" />
              </button>
            ) : null}

            {visibleMessages.length === 0 ? (
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
            ) : null}

            {error ? <div className="error-banner">{error}</div> : null}

            <InputContainer
              canSend={canSend}
              contextState={contextState}
              draft={draft}
              focusText={focusText}
              hasMessages={visibleMessages.length > 0}
              isStreaming={isStreaming}
              onAbort={stopStreaming}
              onDraftChange={setDraft}
              onModelChange={(modelId) => void selectModel(modelId)}
              selectedModel={selectedModel}
              sendPrompt={sendPrompt}
              settings={settings}
              visibleModels={visibleModels}
            />
          </div>
        </div>
      </section>
    </main>
  );
}
