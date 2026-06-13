import type { ChatMessageRecord, InternalModelId, ProviderId } from "@askai/core";
import type { SiblingInfo } from "@askai/core";
import {
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  GitBranch,
  Pencil,
  RotateCcw,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { modelsForSettings } from "../product";
import { useSidepanelStore } from "../../store/sidepanelstore";
import { getModelProviderId, getProviderDetails } from "../utils/misc";
import { RetryDropdown } from "./retryDropdown";

const markdownComponents = {
  a: (props: React.ComponentProps<"a">) => <a {...props} target="_blank" rel="noreferrer" />,
};

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
});

function formatDuration(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return null;
  if (ms < 1000) return `${Math.max(1, Math.round(ms))}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) {
    return seconds < 10 ? `${seconds.toFixed(1)}s` : `${Math.round(seconds)}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds - mins * 60);
  return `${mins}m ${secs}s`;
}

interface MessageBubbleProps {
  message: ChatMessageRecord;
  siblingInfo?: SiblingInfo;
}

export function MessageBubble({ message, siblingInfo }: MessageBubbleProps) {
  const isAssistant = message.role === "assistant";
  const isUser = message.role === "user";

  const [copied, setCopied] = useState(false);
  const [retryOpen, setRetryOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(message.content);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const settings = useSidepanelStore((state) => state.settings);
  const isStreaming = useSidepanelStore((state) => state.isStreaming);
  const retryMessage = useSidepanelStore((state) => state.retryMessage);
  const editMessage = useSidepanelStore((state) => state.editMessage);
  const branchFromMessage = useSidepanelStore((state) => state.branchFromMessage);
  const navigateSibling = useSidepanelStore((state) => state.navigateSibling);

  const availableModels = useMemo(() => (settings ? modelsForSettings(settings) : []), [settings]);

  useEffect(
    () => () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!editing) {
      setEditDraft(message.content);
    }
  }, [editing, message.content]);

  const showFooter = message.status !== "streaming";
  const footerDate = new Date(isAssistant ? message.updatedAt : message.createdAt);
  const footerTime = Number.isNaN(footerDate.getTime()) ? null : timeFormatter.format(footerDate);
  const duration =
    isAssistant && showFooter
      ? formatDuration(
          new Date(message.updatedAt).getTime() - new Date(message.createdAt).getTime(),
        )
      : null;

  const messageModel = message.modelId
    ? availableModels.find((model) => model.internalId === message.modelId)
    : undefined;
  const messageProviderDetails = messageModel
    ? getProviderDetails(getModelProviderId(messageModel))
    : undefined;

  const handleCopy = () => {
    void navigator.clipboard.writeText(message.content);
    setCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
  };

  const handleRetrySame = () => {
    if (!isUser) return;
    void retryMessage(message.id);
  };

  const handleRetryWithModel = (providerId: ProviderId, modelId: InternalModelId) => {
    if (!isUser) return;
    void retryMessage(message.id, { providerId, modelId });
  };

  const handleBranch = () => {
    if (!isUser) return;
    void branchFromMessage(message.id);
  };

  const handleEditSubmit = () => {
    if (!isUser) return;
    const trimmed = editDraft.trim();
    if (!trimmed || trimmed === message.content) {
      setEditing(false);
      return;
    }
    void editMessage(message.id, trimmed).then((ok) => {
      if (ok) setEditing(false);
    });
  };

  const handleEditCancel = () => {
    setEditing(false);
    setEditDraft(message.content);
  };

  const renderSiblingNavigator = () => {
    if (!siblingInfo || siblingInfo.total <= 1) {
      return null;
    }
    const prevId = siblingInfo.siblingIds[siblingInfo.index - 1];
    const nextId = siblingInfo.siblingIds[siblingInfo.index + 1];
    return (
      <div className="sibling-navigator">
        <button
          aria-label="Previous variant"
          disabled={!prevId || isStreaming}
          onClick={() => prevId && void navigateSibling(prevId)}
          type="button"
        >
          <ChevronLeft size={11} aria-hidden="true" />
        </button>
        <span>
          {siblingInfo.index + 1}/{siblingInfo.total}
        </span>
        <button
          aria-label="Next variant"
          disabled={!nextId || isStreaming}
          onClick={() => nextId && void navigateSibling(nextId)}
          type="button"
        >
          <ChevronRight size={11} aria-hidden="true" />
        </button>
      </div>
    );
  };

  const renderUserActions = () => {
    if (!isUser || editing) return null;
    const actionsDisabled = isStreaming;
    return (
      <div className="message-actions" data-pinned={retryOpen || undefined}>
        <div className="message-action-wrap">
          <button
            aria-label="Retry"
            className="message-action-button"
            data-active={retryOpen || undefined}
            disabled={actionsDisabled}
            onClick={() => setRetryOpen((open) => !open)}
            type="button"
          >
            <RotateCcw size={13} aria-hidden="true" />
          </button>
          {retryOpen ? (
            <RetryDropdown
              models={availableModels}
              currentModelId={message.modelId ?? settings?.defaultModelId}
              onRetrySame={handleRetrySame}
              onRetryWithModel={handleRetryWithModel}
              onClose={() => setRetryOpen(false)}
            />
          ) : null}
        </div>
        <button
          aria-label="Branch into new conversation"
          className="message-action-button"
          disabled={actionsDisabled}
          onClick={handleBranch}
          type="button"
        >
          <GitBranch size={13} aria-hidden="true" />
        </button>
        <button
          aria-label="Edit message"
          className="message-action-button"
          disabled={actionsDisabled}
          onClick={() => setEditing(true)}
          type="button"
        >
          <Pencil size={13} aria-hidden="true" />
        </button>
        <button
          aria-label={copied ? "Copied" : "Copy message"}
          className="message-action-button"
          data-copied={copied || undefined}
          onClick={handleCopy}
          type="button"
        >
          {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
        </button>
      </div>
    );
  };

  return (
    <article className={`message-bubble ${message.role}`} data-status={message.status}>
      <div className="message-meta">
        <span>{isAssistant ? "Assistant" : "You"}</span>
        {isAssistant && message.content ? (
          <button
            aria-label={copied ? "Copied" : "Copy response"}
            className="copy-button"
            data-copied={copied || undefined}
            data-tooltip="Copied!"
            onClick={handleCopy}
            type="button"
          >
            {copied ? (
              <Check size={13} aria-hidden="true" />
            ) : (
              <Copy size={13} aria-hidden="true" />
            )}
          </button>
        ) : null}
      </div>

      {editing && isUser ? (
        <div className="message-edit-form">
          <textarea
            ref={(node) => {
              if (node && editing) {
                node.focus();
                const length = node.value.length;
                node.setSelectionRange(length, length);
              }
            }}
            onChange={(event) => setEditDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                handleEditSubmit();
              } else if (event.key === "Escape") {
                event.preventDefault();
                handleEditCancel();
              }
            }}
            value={editDraft}
          />
          <div className="message-edit-row">
            <button
              aria-label="Cancel edit"
              className="message-action-button"
              onClick={handleEditCancel}
              type="button"
            >
              <X size={13} aria-hidden="true" />
            </button>
            <button
              aria-label="Send edited message"
              className="message-edit-send"
              disabled={isStreaming || !editDraft.trim()}
              onClick={handleEditSubmit}
              type="button"
            >
              <ArrowUp size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : isAssistant && message.content ? (
        <div className="message-markdown">
          <Markdown components={markdownComponents} remarkPlugins={[remarkGfm]}>
            {message.content}
          </Markdown>
        </div>
      ) : (
        <p>{message.content || (message.status === "streaming" ? "Thinking..." : "")}</p>
      )}

      {message.status === "streaming" ? <small>Streaming...</small> : null}
      {message.status === "cancelled" ? <small>Stopped.</small> : null}
      {message.error ? <small>{message.error.message}</small> : null}

      {showFooter && footerTime ? (
        <footer className="message-footer">
          <span>{footerTime}</span>
          {duration ? (
            <>
              <span aria-hidden="true">•</span>
              <span>{duration}</span>
            </>
          ) : null}
          {isAssistant && messageModel ? (
            <>
              <span aria-hidden="true">•</span>
              <span className="message-model-label">
                {messageProviderDetails ? (
                  <img src={messageProviderDetails.iconSrc} alt="" />
                ) : null}
                {messageModel.label}
              </span>
            </>
          ) : null}
          {message.editedAt && isUser ? (
            <>
              <span aria-hidden="true">•</span>
              <span>edited</span>
            </>
          ) : null}
          {renderSiblingNavigator()}
        </footer>
      ) : null}

      {renderUserActions()}
    </article>
  );
}
