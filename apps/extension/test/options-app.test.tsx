import { defaultSettings } from "@askai/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../entrypoints/options/App";
import { installChromeMock } from "./chrome-test-utils";

const productMocks = vi.hoisted(() => ({
  clearProviderApiKey: vi.fn(),
  loadSettings: vi.fn(),
  readApiKeyStatus: vi.fn(),
  readStorageUsage: vi.fn(),
  requestHistoryPersistence: vi.fn(),
  saveProviderApiKey: vi.fn(),
  saveSettings: vi.fn(),
  testProviderConnection: vi.fn(),
}));

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

beforeEach(() => {
  vi.clearAllMocks();
  installChromeMock();
  productMocks.clearProviderApiKey.mockResolvedValue(undefined);
  productMocks.loadSettings.mockResolvedValue(defaultSettings);
  productMocks.readApiKeyStatus.mockResolvedValue({ openai: true, openrouter: false });
  productMocks.readStorageUsage.mockResolvedValue({
    persisted: true,
    quota: 1_048_576,
    usage: 1_536,
  });
  productMocks.requestHistoryPersistence.mockResolvedValue(true);
  productMocks.saveProviderApiKey.mockResolvedValue(undefined);
  productMocks.saveSettings.mockResolvedValue(undefined);
  productMocks.testProviderConnection.mockResolvedValue({
    ok: true,
    message: "OpenAI connection works.",
  });
});

describe("options App", () => {
  it("loads settings, provider key status, and storage usage", async () => {
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Ask AI Options" })).toBeInTheDocument();
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.getByText("Missing")).toBeInTheDocument();
    expect(screen.getByText("1.5 KB")).toBeInTheDocument();
    expect(screen.getByText("1.0 MB")).toBeInTheDocument();
    expect(screen.getByText("Granted")).toBeInTheDocument();
  });

  it("persists default provider and model changes", async () => {
    render(<App />);

    await screen.findByRole("heading", { name: "Ask AI Options" });

    fireEvent.change(screen.getByLabelText("Default provider"), {
      target: { value: "openrouter" },
    });

    await waitFor(() => {
      expect(productMocks.saveSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultProviderId: "openrouter",
          defaultModelId: expect.stringMatching(/^openrouter:/),
        }),
      );
    });

    fireEvent.change(screen.getByLabelText("Default model"), {
      target: { value: "openai:gpt-4.1" },
    });

    await waitFor(() => {
      expect(productMocks.saveSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultProviderId: "openai",
          defaultModelId: "openai:gpt-4.1",
        }),
      );
    });
  });

  it("persists model visibility, favorites, and excluded site settings", async () => {
    render(<App />);

    await screen.findByRole("heading", { name: "Ask AI Options" });

    fireEvent.click(screen.getAllByLabelText("Favorite")[0] as HTMLElement);
    await waitFor(() => {
      expect(productMocks.saveSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          favoriteModelIds: expect.arrayContaining([expect.any(String)]),
        }),
      );
    });

    fireEvent.click(screen.getAllByLabelText("Visible")[0] as HTMLElement);
    await waitFor(() => {
      expect(productMocks.saveSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          hiddenModelIds: expect.arrayContaining([expect.any(String)]),
        }),
      );
    });

    const excludedSites = screen.getByLabelText("Excluded sites");
    fireEvent.change(excludedSites, {
      target: { value: "example.com\nhttps://private.example.com/path" },
    });
    fireEvent.blur(excludedSites);

    await waitFor(() => {
      expect(productMocks.saveSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          excludedSites: ["example.com", "https://private.example.com/path"],
        }),
      );
    });
  });
});
