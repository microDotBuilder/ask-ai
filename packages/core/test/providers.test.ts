import { describe, expect, it } from "vitest";
import {
  findModelInfo,
  parseOpenAiCompatibleSseEvent,
  parseOpenAiCompatibleSseStream,
  parseProviderModelId,
  ProviderConfigurationError,
  resolveProviderRequestConfig,
  type InternalModelId,
} from "../src";

function streamFromText(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

async function collectStream(stream: ReadableStream<Uint8Array>) {
  const chunks = [];

  for await (const chunk of parseOpenAiCompatibleSseStream(stream)) {
    chunks.push(chunk);
  }

  return chunks;
}

describe("provider model parsing and config", () => {
  it("parses internal model ids into provider selections", () => {
    expect(parseProviderModelId("openai:gpt-4.1-mini")).toEqual({
      providerId: "openai",
      modelId: "gpt-4.1-mini",
      internalModelId: "openai:gpt-4.1-mini",
    });
  });

  it("resolves OpenAI and OpenRouter request config", () => {
    expect(
      resolveProviderRequestConfig({
        internalModelId: "openai:gpt-4.1-mini",
        apiKey: "sk-test",
      }),
    ).toMatchObject({
      id: "openai",
      model: "gpt-4.1-mini",
      baseUrl: "https://api.openai.com/v1",
      headers: {
        Authorization: "Bearer sk-test",
      },
    });

    expect(
      resolveProviderRequestConfig({
        internalModelId: "openrouter:anthropic/claude-sonnet-4",
        apiKey: "sk-or-test",
        appTitle: "Ask AI",
        appUrl: "https://ask-ai.example",
      }),
    ).toMatchObject({
      id: "openrouter",
      model: "anthropic/claude-sonnet-4",
      baseUrl: "https://openrouter.ai/api/v1",
      headers: {
        Authorization: "Bearer sk-or-test",
        "HTTP-Referer": "https://ask-ai.example",
        "X-Title": "Ask AI",
      },
    });
  });

  it("falls back to the parsed model id when catalog metadata is missing", () => {
    expect(findModelInfo("openai:gpt-future" as InternalModelId)).toBeUndefined();
    expect(
      resolveProviderRequestConfig({
        internalModelId: "openai:gpt-future" as InternalModelId,
        apiKey: "sk-test",
      }).model,
    ).toBe("gpt-future");
  });

  it("throws a tagged configuration error for unsupported providers", () => {
    expect(() =>
      resolveProviderRequestConfig({
        internalModelId: "local:model" as InternalModelId,
        apiKey: "test",
      }),
    ).toThrow(ProviderConfigurationError);
  });
});

describe("OpenAI-compatible SSE parsing", () => {
  it("parses content, finish, provider error, and malformed chunks", () => {
    expect(
      parseOpenAiCompatibleSseEvent(
        JSON.stringify({
          choices: [{ delta: { content: "hello" } }],
        }),
      ),
    ).toEqual([{ type: "content", content: "hello" }]);

    expect(
      parseOpenAiCompatibleSseEvent(
        JSON.stringify({
          choices: [{ delta: {}, finish_reason: "stop" }],
        }),
      ),
    ).toEqual([{ type: "finish", finishReason: "stop" }]);

    expect(
      parseOpenAiCompatibleSseEvent(
        JSON.stringify({
          error: { message: "Model not found", code: "model_not_found" },
        }),
      ),
    ).toEqual([{ type: "error", message: "Model not found", code: "model_not_found" }]);

    expect(parseOpenAiCompatibleSseEvent("{")).toEqual([
      { type: "error", message: "Provider returned malformed stream data." },
    ]);
    expect(parseOpenAiCompatibleSseEvent("[DONE]")).toEqual([{ type: "finish" }]);
  });

  it("parses complete SSE streams across provider events", async () => {
    await expect(
      collectStream(
        streamFromText(
          [
            'event: message\ndata: {"choices":[{"delta":{"content":"Hel"}}]}',
            'data: {"choices":[{"delta":{"content":"lo"}},{"delta":{"content":"!"}}]}',
            'data: {"choices":[{"finish_reason":"stop"}]}',
            "data: [DONE]",
          ].join("\n\n"),
        ),
      ),
    ).resolves.toEqual([
      { type: "content", content: "Hel" },
      { type: "content", content: "lo" },
      { type: "content", content: "!" },
      { type: "finish", finishReason: "stop" },
      { type: "finish" },
    ]);
  });
});
