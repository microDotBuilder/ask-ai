import type { ModelInfo, ProviderId } from "@askai/core";
import { defaultSettings } from "@askai/core";
import openAiIconUrl from "../../../../assets/openai.svg";
import geminiIconUrl from "../../../../assets/gemenai.svg";
import anthropicIconUrl from "../../../../assets/anthropic.svg";
import { modelsForSettings } from "../product";
import type { ModelProvider, ModelProviderGroup, ModelProviderId } from "../types/types";

export async function getActiveTabId(): Promise<number | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

export const openAiModelProvider: ModelProvider = {
  id: "openai",
  name: "OpenAI",
  iconSrc: openAiIconUrl,
};

export const fallbackModelProviderGroup: ModelProviderGroup = {
  ...openAiModelProvider,
  models: [],
};

export const modelProviders: ModelProvider[] = [
  openAiModelProvider,
  {
    id: "gemini",
    name: "Gemini",
    iconSrc: geminiIconUrl,
  },
  {
    id: "anthropic",
    name: "Anthropic",
    iconSrc: anthropicIconUrl,
  },
];

export function getVisibleSetupModels(providerId: ProviderId) {
  return defaultSettings
    ? modelsForSettings(defaultSettings).filter((model) => model.providerId === providerId)
    : [];
}

export function getProviderDetails(providerId: ModelProviderId) {
  return modelProviders.find((provider) => provider.id === providerId) ?? openAiModelProvider;
}

export function getModelProviderId(model: ModelInfo): ModelProviderId {
  const family = model.family.toLowerCase();
  const label = model.label.toLowerCase();
  const id = model.id.toLowerCase();
  const routedProvider = model.openRouterRoute?.routedProvider;

  if (routedProvider === "google" || family.includes("gemini") || label.includes("gemini")) {
    return "gemini";
  }

  if (
    routedProvider === "anthropic" ||
    family.includes("anthropic") ||
    label.includes("claude") ||
    id.includes("claude")
  ) {
    return "anthropic";
  }

  return "openai";
}

export function formatCompactNumber(value: number) {
  return new Intl.NumberFormat(undefined, {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}
