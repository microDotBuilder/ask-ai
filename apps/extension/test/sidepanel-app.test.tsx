import {
  type ChatMessageRecord,
  defaultSettings,
  messageTypes,
  type PageContext,
} from "@askai/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../entrypoints/sidepanel/App";
import { installChromeMock } from "./chrome-test-utils";

const chromeModuleMocks = vi.hoisted(() => ({
  addChromeMessageListener: vi.fn(() => vi.fn()),
  sendRuntimeMessage: vi.fn(),
}));

const productMocks = vi.hoisted(() => ({
  loadSettings: vi.fn(),
  readApiKeyStatus: vi.fn(),
  readStorageUsage: vi.fn(),
  requestHistoryPersistence: vi.fn(),
  saveProviderApiKey: vi.fn(),
  saveSettings: vi.fn(),
  takePendingQuickAction: vi.fn(),
  testProviderConnection: vi.fn(),
}));

const chatMocks = vi.hoisted(() => ({
  restoreActiveConversation: vi.fn(),
  streamChat: vi.fn(),
}));

vi.mock("../src/chrome", () => chromeModuleMocks);

vi.mock("../src/product", async () => {
  const core = await vi.importActual<typeof import("@askai/core")>("@askai/core");

  return {
    ...productMocks,
    modelsForSettings: vi.fn((settings: typeof core.defaultSettings) =>
      core.getVisibleModels({
        hiddenModelIds: settings.hiddenModelIds,
        favoriteModelIds: settings.favoriteModelIds,
      }),
    ),
    providerLabels: {
      openai: "OpenAI",
      openrouter: "OpenRouter",
    },
  };
});

vi.mock("../src/sidepanel/chat", () => chatMocks);

const pageContext: PageContext = {
  title: "Testing page",
  url: "https://example.com/testing",
  domain: "example.com",
  mode: "full-page",
  text: "Page context",
  truncated: false,
  metrics: {
    characterCount: 12,
    extractedCharacterCount: 12,
    truncatedCharacterCount: 0,
    headingCount: 1,
    paragraphCount: 2,
    listCount: 3,
    codeBlockCount: 0,
    tableCount: 0,
  },
};

function message(overrides: Partial<ChatMessageRecord> & Pick<ChatMessageRecord, "id">) {
  return {
    id: overrides.id,
    conversationId: overrides.conversationId ?? "conversation-1",
    role: overrides.role ?? "assistant",
    content: overrides.content ?? "",
    tokenEstimate: overrides.tokenEstimate ?? 0,
    storageBytes: overrides.storageBytes ?? 0,
    status: overrides.status,
    createdAt: overrides.createdAt ?? "2026-06-07T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-06-07T00:00:00.000Z",
    error: overrides.error,
    finishReason: overrides.finishReason,
  } satisfies ChatMessageRecord;
}

beforeEach(() => {
  vi.clearAllMocks();
  installChromeMock();
  chromeModuleMocks.addChromeMessageListener.mockReturnValue(() => undefined);
  chromeModuleMocks.sendRuntimeMessage.mockResolvedValue({
    type: messageTypes.pageContextResponse,
    status: "available",
    context: pageContext,
  });
  productMocks.loadSettings.mockResolvedValue(defaultSettings);
  productMocks.readApiKeyStatus.mockResolvedValue({ openai: true, openrouter: false });
  productMocks.requestHistoryPersistence.mockResolvedValue(true);
  productMocks.saveProviderApiKey.mockResolvedValue(undefined);
  productMocks.saveSettings.mockResolvedValue(undefined);
  productMocks.takePendingQuickAction.mockResolvedValue(undefined);
  productMocks.testProviderConnection.mockResolvedValue({
    ok: true,
    message: "OpenAI connection works.",
  });
  chatMocks.restoreActiveConversation.mockResolvedValue({ messages: [] });
  chatMocks.streamChat.mockResolvedValue({
    assistantMessage: message({ id: "assistant", content: "Done", status: "complete" }),
    conversation: {
      id: "conversation-1",
      title: "Question",
      status: "active",
      pinned: false,
      providerId: "openai",
      modelId: "openai:gpt-4.1-mini",
      storageBytes: 0,
      createdAt: "2026-06-07T00:00:00.000Z",
      updatedAt: "2026-06-07T00:00:00.000Z",
    },
    userMessage: message({ id: "user", role: "user", content: "Question", status: "complete" }),
  });
});

describe("side panel App", () => {
  it("shows onboarding when the selected provider key is missing", async () => {
    productMocks.readApiKeyStatus.mockResolvedValue({ openai: false, openrouter: false });

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Set up Ask AI" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Test and finish setup" }));

    expect(await screen.findByText("Enter an API key to continue.")).toBeInTheDocument();
  });

  it("renders available context and submits prompts through the chat service", async () => {
    chatMocks.streamChat.mockImplementation(async (input) => {
      input.onMessageUpdate?.(
        message({
          id: "assistant",
          role: "assistant",
          content: "Streaming answer",
          status: "streaming",
        }),
      );
      input.onMessageUpdate?.(
        message({
          id: "assistant",
          role: "assistant",
          content: "Streaming answer complete",
          status: "complete",
        }),
      );

      return {
        assistantMessage: message({
          id: "assistant",
          role: "assistant",
          content: "Streaming answer complete",
          status: "complete",
        }),
        conversation: {
          id: "conversation-1",
          title: "What matters?",
          status: "active",
          pinned: false,
          providerId: "openai",
          modelId: "openai:gpt-4.1-mini",
          storageBytes: 0,
          createdAt: "2026-06-07T00:00:00.000Z",
          updatedAt: "2026-06-07T00:00:00.000Z",
        },
        userMessage: message({
          id: "user",
          role: "user",
          content: input.question,
          status: "complete",
        }),
      };
    });

    render(<App />);

    expect(await screen.findByText("Context ready")).toBeInTheDocument();
    expect(screen.getByText("Testing page")).toBeInTheDocument();
    expect(
      screen.getByText("example.com / 12 characters / 1 headings / 2 paragraphs / 3 list items"),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Ask for follow-up changes or attach images"), {
      target: { value: "What matters?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(chatMocks.streamChat).toHaveBeenCalledWith(
        expect.objectContaining({
          question: "What matters?",
          pageContext,
          tabId: 12,
        }),
      );
    });
    expect(await screen.findByText("Streaming answer complete")).toBeInTheDocument();
  });

  it("renders blocked context state and disables the prompt", async () => {
    chromeModuleMocks.sendRuntimeMessage.mockResolvedValue({
      type: messageTypes.pageContextResponse,
      status: "blocked",
      unavailable: {
        availability: "blocked",
        reason: "sensitive-page",
        message: "This page contains password fields, so Ask AI will not read it.",
      },
    });

    render(<App />);

    expect(await screen.findByText("Context blocked")).toBeInTheDocument();
    expect(
      screen.getAllByText("This page contains password fields, so Ask AI will not read it.").length,
    ).toBeGreaterThan(0);
    expect(screen.getByPlaceholderText("Page context is unavailable")).toBeDisabled();
  });
});
