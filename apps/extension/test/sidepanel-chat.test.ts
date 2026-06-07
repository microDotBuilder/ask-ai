import {
  defaultSettings,
  encryptApiKey,
  exportApiKeyEncryptionKey,
  generateApiKeyEncryptionKey,
  type PageContext,
  saveEncryptedApiKey,
  writeApiKeyEncryptionKey,
  writeSettings,
} from "@askai/core";
import { createMessageRepository, db } from "@askai/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { restoreActiveConversation, streamChat } from "../src/sidepanel/chat";
import { installChromeMock } from "./chrome-test-utils";

const pageContext: PageContext = {
  title: "Streaming page",
  url: "https://example.com/streaming",
  domain: "example.com",
  mode: "full-page",
  text: "Useful page context",
  truncated: false,
  metrics: {
    characterCount: 19,
    extractedCharacterCount: 19,
    truncatedCharacterCount: 0,
    headingCount: 1,
    paragraphCount: 1,
    listCount: 0,
    codeBlockCount: 0,
    tableCount: 0,
  },
};

function providerStream(events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`${event}\n\n`));
      }
      controller.close();
    },
  });
}

async function installProviderKey(): Promise<void> {
  const key = await generateApiKeyEncryptionKey();
  const encodedKey = await exportApiKeyEncryptionKey(key);

  await writeApiKeyEncryptionKey(chrome.storage.local, encodedKey);
  await saveEncryptedApiKey(chrome.storage.local, await encryptApiKey("openai", "sk-test", key));
}

beforeEach(async () => {
  vi.clearAllMocks();
  await db.delete().catch(() => undefined);
  installChromeMock();
  await writeSettings(chrome.storage.sync, defaultSettings);
  await installProviderKey();
});

afterEach(async () => {
  await db.delete().catch(() => undefined);
  db.close();
});

describe("side panel chat service", () => {
  it("streams provider content into persisted assistant messages", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        providerStream([
          'data: {"choices":[{"delta":{"content":"Hello"}}]}',
          'data: {"choices":[{"delta":{"content":" world"}}]}',
          'data: {"choices":[{"finish_reason":"stop"}]}',
        ]),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const updates = [];

    const result = await streamChat({
      question: "What does this page say?",
      pageContext,
      tabId: 12,
      onMessageUpdate: (message) => updates.push(message),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer sk-test",
        }),
        method: "POST",
      }),
    );
    expect(result.assistantMessage).toMatchObject({
      content: "Hello world",
      finishReason: "stop",
      status: "complete",
    });
    expect(updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "user", status: "complete" }),
        expect.objectContaining({ role: "assistant", status: "complete" }),
      ]),
    );

    await expect(restoreActiveConversation(12)).resolves.toMatchObject({
      conversation: {
        id: result.conversation.id,
      },
      messages: expect.arrayContaining([
        expect.objectContaining({ role: "user", content: "What does this page say?" }),
        expect.objectContaining({ role: "assistant", content: "Hello world" }),
      ]),
    });
  });

  it("persists provider HTTP errors on the assistant message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Invalid API key", { status: 401 })),
    );

    await expect(
      streamChat({
        question: "Fail please",
        pageContext,
        tabId: 12,
      }),
    ).rejects.toMatchObject({
      code: "provider-http-error",
      message: "Invalid API key",
    });

    const restored = await restoreActiveConversation(12);
    expect(restored.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "assistant",
          status: "failed",
          error: {
            message: "Invalid API key",
          },
        }),
      ]),
    );
  });

  it("returns a cancelled assistant message when the request signal is aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("The operation was aborted.", "AbortError");
      }),
    );

    const result = await streamChat({
      question: "Stop",
      pageContext,
      signal: controller.signal,
      tabId: 12,
    });

    expect(result.assistantMessage).toMatchObject({
      content: "",
      status: "cancelled",
    });
    await expect(createMessageRepository().get(result.assistantMessage.id)).resolves.toMatchObject({
      status: "cancelled",
    });
  });
});
