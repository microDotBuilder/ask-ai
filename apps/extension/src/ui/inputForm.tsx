import type { AskAiSettings, InternalModelId, ModelInfo } from "@askai/core";
import { Send, Sparkles, Square } from "lucide-react";
import type { ContextState } from "../types/types";
import { ModelSelector } from "./modelSelector";
import { TokenUsageMeter } from "./tokenUsageMeter";

export type InputContainerProps = {
  canSend: boolean;
  contextState: ContextState;
  draft: string;
  focusText?: string;
  hasMessages: boolean;
  isStreaming: boolean;
  onAbort: () => void;
  onDraftChange: (draft: string) => void;
  onModelChange: (modelId: InternalModelId) => void;
  selectedModel?: ModelInfo;
  sendPrompt: (question: string, focus?: string) => Promise<boolean>;
  settings: AskAiSettings;
  visibleModels: ModelInfo[];
};

export function InputContainer({
  canSend,
  contextState,
  draft,
  focusText,
  hasMessages,
  isStreaming,
  onAbort,
  onDraftChange,
  onModelChange,
  selectedModel,
  sendPrompt,
  settings,
  visibleModels,
}: InputContainerProps) {
  return (
    <form
      className="chat-form"
      onSubmit={(event) => {
        event.preventDefault();
        void sendPrompt(draft, focusText);
      }}
    >
      <textarea
        disabled={contextState.status !== "available"}
        onChange={(event) => onDraftChange(event.target.value)}
        placeholder={
          contextState.status === "available"
            ? hasMessages
              ? "Ask a follow-up..."
              : "Ask about this page..."
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
            onModelChange={onModelChange}
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
          onClick={isStreaming ? onAbort : undefined}
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
  );
}
