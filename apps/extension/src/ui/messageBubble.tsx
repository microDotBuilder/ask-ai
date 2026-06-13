import type { ChatMessageRecord } from "@askai/core";
import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const markdownComponents = {
  a: (props: React.ComponentProps<"a">) => (
    <a {...props} target="_blank" rel="noreferrer" />
  ),
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

export function MessageBubble({ message }: { message: ChatMessageRecord }) {
  const isAssistant = message.role === "assistant";
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showFooter = message.status !== "streaming";
  const footerDate = new Date(isAssistant ? message.updatedAt : message.createdAt);
  const footerTime = Number.isNaN(footerDate.getTime())
    ? null
    : timeFormatter.format(footerDate);
  const duration =
    isAssistant && showFooter
      ? formatDuration(
          new Date(message.updatedAt).getTime() - new Date(message.createdAt).getTime(),
        )
      : null;

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  const handleCopy = () => {
    void navigator.clipboard.writeText(message.content);
    setCopied(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), 2000);
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
      {isAssistant && message.content ? (
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
        </footer>
      ) : null}
    </article>
  );
}
