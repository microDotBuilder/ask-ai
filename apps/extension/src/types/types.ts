import type { ModelInfo, PageContextResponseMessage } from "@askai/core";

export type ContextState =
  | { status: "loading" }
  | {
      status: "available";
      response: PageContextResponseMessage;
      context: Extract<PageContextResponseMessage, { status: "available" }>["context"];
    }
  | {
      status: "blocked" | "unsupported" | "failed";
      response: Exclude<PageContextResponseMessage, { status: "available" }>;
    };

export function contextStateFromResponse(response: PageContextResponseMessage): ContextState {
  if (response.status === "available") {
    return {
      status: "available",
      response,
      context: response.context,
    };
  }

  return {
    status: response.status,
    response,
  };
}

export type ModelProviderId = "openai" | "gemini" | "anthropic";

export interface ModelProvider {
  id: ModelProviderId;
  name: string;
  iconSrc: string;
  emptyTooltip?: string;
}

export interface ModelProviderGroup extends ModelProvider {
  models: ModelInfo[];
}

export type ContextSummary = {
  title: string;
  domain: string;
  characterCount: string;
  blocks: string;
  truncated: boolean;
};
