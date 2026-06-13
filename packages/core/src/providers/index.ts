import { Data } from "effect";
import * as Schema from "effect/Schema";
import {
  bundledModelCatalog,
  fromInternalModelId,
  type ModelInfo,
  type ModelCatalogResponse,
} from "../models";
import type { ChatRole, InternalModelId, ProviderId } from "../types";

export interface ProviderConfig {
  id: ProviderId;
  model: string;
}

export interface ProviderRequestConfig extends ProviderConfig {
  baseUrl: string;
  headers: Record<string, string>;
}

export interface ProviderModelSelection {
  providerId: ProviderId;
  modelId: string;
  internalModelId: InternalModelId;
}

export interface ConnectionTestResult {
  providerId: ProviderId;
  ok: boolean;
  checkedAt: string;
  error?: string;
}

export type TestProviderConnection = (
  providerId: ProviderId,
  apiKey: string,
) => Promise<ConnectionTestResult>;

export interface OpenAiCompatibleMessage {
  role: ChatRole;
  content: string;
}

export interface OpenAiCompatibleChatRequest {
  model: string;
  messages: OpenAiCompatibleMessage[];
  stream: true;
  temperature?: number;
  max_tokens?: number;
}

export interface ProviderStreamContentChunk {
  type: "content";
  content: string;
}

export interface ProviderStreamFinishChunk {
  type: "finish";
  finishReason?: string;
}

export interface ProviderStreamErrorChunk {
  type: "error";
  message: string;
  code?: string;
}

export type ProviderStreamChunk =
  | ProviderStreamContentChunk
  | ProviderStreamFinishChunk
  | ProviderStreamErrorChunk;

export class ProviderConfigurationError extends Data.TaggedError("ProviderConfigurationError")<{
  message: string;
  providerId?: ProviderId;
}> {}

export class ProviderStreamError extends Data.TaggedError("ProviderStreamError")<{
  message: string;
  code?: string;
}> {}

const ProviderErrorPayloadSchema = Schema.Struct({
  error: Schema.Union(
    Schema.String,
    Schema.Struct({
      message: Schema.optional(Schema.String),
      code: Schema.optional(Schema.String),
    }),
  ),
});

const OpenAiCompatibleStreamEventSchema = Schema.Struct({
  choices: Schema.Array(
    Schema.Struct({
      delta: Schema.optional(
        Schema.Struct({
          content: Schema.optional(Schema.Union(Schema.String, Schema.Null)),
        }),
      ),
      finish_reason: Schema.optional(Schema.Union(Schema.String, Schema.Null)),
    }),
  ),
});

export function parseProviderModelId(internalModelId: InternalModelId): ProviderModelSelection {
  const parsed = fromInternalModelId(internalModelId);

  return {
    providerId: parsed.providerId,
    modelId: parsed.modelId,
    internalModelId,
  };
}

export function findModelInfo(
  internalModelId: InternalModelId,
  catalog: ModelCatalogResponse = bundledModelCatalog,
): ModelInfo | undefined {
  return catalog.models.find((model) => model.internalId === internalModelId);
}

export function resolveProviderRequestConfig(options: {
  internalModelId: InternalModelId;
  apiKey: string;
  appUrl?: string;
  appTitle?: string;
  catalog?: ModelCatalogResponse;
}): ProviderRequestConfig {
  const selection = parseProviderModelId(options.internalModelId);
  const modelInfo = findModelInfo(options.internalModelId, options.catalog);
  const model = modelInfo?.id ?? selection.modelId;

  if (selection.providerId === "openai") {
    return {
      id: "openai",
      model,
      baseUrl: "https://api.openai.com/v1",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
    };
  }

  if (selection.providerId === "openrouter") {
    return {
      id: "openrouter",
      model,
      baseUrl: "https://openrouter.ai/api/v1",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
        ...(options.appUrl ? { "HTTP-Referer": options.appUrl } : {}),
        ...(options.appTitle ? { "X-Title": options.appTitle } : {}),
      },
    };
  }

  throw new ProviderConfigurationError({
    message: `Unsupported provider: ${selection.providerId}`,
    providerId: selection.providerId,
  });
}

function providerErrorFromJson(value: unknown): ProviderStreamErrorChunk | undefined {
  let parsed: Schema.Schema.Type<typeof ProviderErrorPayloadSchema>;

  try {
    parsed = Schema.decodeUnknownSync(ProviderErrorPayloadSchema)(value);
  } catch {
    return undefined;
  }

  const { error } = parsed;

  if (typeof error === "string") {
    return { type: "error", message: error };
  }

  return {
    type: "error",
    message: error.message ?? "Provider stream failed.",
    code: error.code,
  };
}

export function parseOpenAiCompatibleSseEvent(data: string): ProviderStreamChunk[] {
  if (data === "[DONE]") {
    return [{ type: "finish" }];
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(data);
  } catch {
    return [{ type: "error", message: "Provider returned malformed stream data." }];
  }

  const providerError = providerErrorFromJson(parsed);
  if (providerError) {
    return [providerError];
  }

  let streamEvent: Schema.Schema.Type<typeof OpenAiCompatibleStreamEventSchema>;
  try {
    streamEvent = Schema.decodeUnknownSync(OpenAiCompatibleStreamEventSchema)(parsed);
  } catch {
    return [];
  }

  return streamEvent.choices.flatMap((choice): ProviderStreamChunk[] => {
    const finishReason = choice.finish_reason ?? undefined;
    const chunks: ProviderStreamChunk[] = [];
    const content = choice.delta?.content ?? undefined;

    if (content) {
      chunks.push({ type: "content", content });
    }

    if (finishReason) {
      chunks.push({ type: "finish", finishReason });
    }

    return chunks;
  });
}

export async function* parseOpenAiCompatibleSseStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<ProviderStreamChunk> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? "";

      for (const event of events) {
        const data = event
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");

        if (!data) {
          continue;
        }

        for (const chunk of parseOpenAiCompatibleSseEvent(data)) {
          yield chunk;
        }
      }
    }

    buffer += decoder.decode();

    if (buffer.trim()) {
      const data = buffer
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");

      if (data) {
        for (const chunk of parseOpenAiCompatibleSseEvent(data)) {
          yield chunk;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
