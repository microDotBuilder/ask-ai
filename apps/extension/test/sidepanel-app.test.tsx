import {
  type ChatMessageRecord,
  defaultSettings,
  messageTypes,
  type PageContext,
} from "@askai/core";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../entrypoints/sidepanel/App";
import { useSidepanelStore } from "../store/sidepanelstore";
import { installChromeMock } from "./chrome-test-utils";

const chromeModuleMocks = vi.hoisted(() => ({
  addChromeMessageListener: vi.fn(() => vi.fn()),
  sendRuntimeMessage: vi.fn(),
}));

const productMocks = vi.hoisted(() => ({
  clearPendingQuickAction: vi.fn(),
  loadSettings: vi.fn(),
  markUiHintsSeen: vi.fn(),
  readApiKeyStatus: vi.fn(),
  readUiHintsSeen: vi.fn(),
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
  useSidepanelStore.setState({
    apiKeyStatus: null,
    abortController: null,
    contextRequestId: 0,
    contextState: { status: "loading" },
    draft: "",
    error: null,
    focusText: undefined,
    headerInfoOpen: false,
    hintsSeen: true,
    isStreaming: false,
    messages: [],
    modelSelectorActiveProviderId: "openai",
    modelSelectorOpen: false,
    modelSelectorSearchTerm: "",
    pendingAction: null,
    settings: null,
    setupDraft: null,
  });
  installChromeMock();
  chromeModuleMocks.addChromeMessageListener.mockReturnValue(() => undefined);
  chromeModuleMocks.sendRuntimeMessage.mockResolvedValue({
    type: messageTypes.pageContextResponse,
    status: "available",
    context: pageContext,
  });
  productMocks.loadSettings.mockResolvedValue(defaultSettings);
  productMocks.clearPendingQuickAction.mockResolvedValue(undefined);
  productMocks.markUiHintsSeen.mockResolvedValue(undefined);
  productMocks.readApiKeyStatus.mockResolvedValue({ openai: true, openrouter: false });
  productMocks.readUiHintsSeen.mockResolvedValue(false);
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
    expect(screen.getAllByText("Testing page").length).toBeGreaterThan(0);
    expect(
      screen.getByText("example.com / 12 characters / 1 headings / 2 paragraphs / 3 list items"),
    ).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Summarize" })).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Ask about this page..."), {
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
    expect(screen.queryByRole("button", { name: "Summarize" })).not.toBeInTheDocument();
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

  it("consumes runtime quick actions once and clears the stored pending copy", async () => {
    render(<App />);

    expect(await screen.findByText("Context ready")).toBeInTheDocument();
    const listener = chromeModuleMocks.addChromeMessageListener.mock.calls[0][0];

    await act(async () => {
      listener({
        type: messageTypes.quickActionRequest,
        actionId: "summarize",
        tabId: 12,
        mode: "full-page",
      });
    });

    await waitFor(() => {
      expect(productMocks.clearPendingQuickAction).toHaveBeenCalledTimes(1);
      expect(chatMocks.streamChat).toHaveBeenCalledTimes(1);
    });
  });

  it("hides first-run hints once they have been seen", async () => {
    productMocks.readUiHintsSeen.mockResolvedValue(true);

    render(<App />);

    expect(await screen.findByText("Ready on example.com")).toBeInTheDocument();
    expect(screen.queryByText("Context ready")).not.toBeInTheDocument();
    expect(screen.queryByText("Current tab")).not.toBeInTheDocument();
    expect(screen.getByText("How can I help with this page?")).toBeInTheDocument();
  });

  it("shows first-run hints and marks them seen on the first prompt", async () => {
    render(<App />);

    expect(await screen.findByText("Context ready")).toBeInTheDocument();
    expect(screen.getByText("Current tab")).toBeInTheDocument();
    expect(screen.getByText("How can I help with this page?")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Ask about this page..."), {
      target: { value: "First question" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(productMocks.markUiHintsSeen).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText("Current tab")).not.toBeInTheDocument();
  });

  it("offers a scroll-to-latest button when the user scrolls up", async () => {
    const { container } = render(<App />);

    expect(await screen.findByText("Context ready")).toBeInTheDocument();

    const scroller = container.querySelector(".chat-scroll");
    if (!(scroller instanceof HTMLElement)) {
      throw new Error("chat scroll container not rendered");
    }

    Object.defineProperty(scroller, "scrollHeight", { configurable: true, value: 1000 });
    Object.defineProperty(scroller, "clientHeight", { configurable: true, value: 400 });
    scroller.scrollTop = 100;
    fireEvent.scroll(scroller);

    const jumpButton = await screen.findByRole("button", { name: "Scroll to latest message" });
    fireEvent.click(jumpButton);

    expect(scroller.scrollTop).toBe(1000);
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Scroll to latest message" }),
      ).not.toBeInTheDocument();
    });
  });

  it("does not retry a pending quick action after a provider failure", async () => {
    productMocks.takePendingQuickAction.mockResolvedValue({
      actionId: "summarize",
      tabId: 12,
      mode: "full-page",
      createdAt: "2026-06-07T00:00:00.000Z",
    });
    chatMocks.streamChat.mockRejectedValue(new Error("Provider failed."));

    render(<App />);

    expect(await screen.findByText("Provider failed.")).toBeInTheDocument();
    expect(chatMocks.streamChat).toHaveBeenCalledTimes(1);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(chatMocks.streamChat).toHaveBeenCalledTimes(1);
  });
});
