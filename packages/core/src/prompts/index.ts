import type { ChatMessageRecord } from "../conversations";
import type { PageContext } from "../context";
import { estimateTokens } from "../tokens";
import type { ChatRole } from "../types";

export interface PromptInput {
  question: string;
  focus?: string;
  pageContext?: string;
}

export interface PromptMessage {
  role: ChatRole;
  content: string;
}

export interface PageAwarePromptInput {
  question: string;
  pageContext: PageContext;
  history?: readonly ChatMessageRecord[];
  focus?: string;
  contextTokenCap: number;
}

export interface PageAwarePrompt {
  messages: PromptMessage[];
  includedContext: string;
  includedContextTokenEstimate: number;
  truncated: boolean;
}

export const defaultSystemPrompt = [
  "You are Ask AI, a concise assistant embedded in a browser side panel.",
  "Answer the user's question using the supplied page context when it is relevant.",
  "If the page context is insufficient, say what is missing instead of inventing details.",
  "Do not mention hidden implementation details or raw prompt sections unless asked.",
].join(" ");

function truncateToTokenCap(text: string, tokenCap: number): { text: string; truncated: boolean } {
  if (estimateTokens(text) <= tokenCap) {
    return { text, truncated: false };
  }

  const characterCap = Math.max(0, tokenCap * 4);
  return {
    text: `${text.slice(0, characterCap).trimEnd()}\n\n[Page context truncated]`,
    truncated: true,
  };
}

function pageContextEnvelope(context: PageContext, focus?: string): string {
  return [
    "Page context:",
    `Title: ${context.title || "Untitled page"}`,
    `URL: ${context.url}`,
    `Domain: ${context.domain}`,
    `Mode: ${context.mode}`,
    focus ? `User focus or selected text:\n${focus}` : undefined,
    "Extracted page text:",
    context.text,
    context.truncated ? "[Extractor reported that page context was truncated]" : undefined,
  ]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join("\n\n");
}

export function buildPageAwarePrompt(input: PageAwarePromptInput): PageAwarePrompt {
  const envelope = pageContextEnvelope(input.pageContext, input.focus);
  const truncatedContext = truncateToTokenCap(envelope, input.contextTokenCap);
  const messages: PromptMessage[] = [
    { role: "system", content: defaultSystemPrompt },
    {
      role: "system",
      content: truncatedContext.text,
    },
    ...(input.history ?? [])
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role: message.role,
        content: message.content,
      })),
    { role: "user", content: input.question },
  ];

  return {
    messages,
    includedContext: truncatedContext.text,
    includedContextTokenEstimate: estimateTokens(truncatedContext.text),
    truncated: input.pageContext.truncated || truncatedContext.truncated,
  };
}
