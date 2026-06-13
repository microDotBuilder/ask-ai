import type { InternalModelId, ProviderId } from "../types";

export type OpenRouterRouteProvider = "anthropic" | "google";

export interface OpenRouterRouteMetadata {
  routedProvider: OpenRouterRouteProvider;
  routedModelId: string;
}

export interface ModelInfo {
  id: string;
  internalId: InternalModelId;
  providerId: ProviderId;
  label: string;
  family: string;
  contextWindow: number;
  maxOutputTokens?: number;
  supportsVision?: boolean;
  supportsToolUse?: boolean;
  isBundled: boolean;
  isAvailable: boolean;
  openRouterRoute?: OpenRouterRouteMetadata;
}

export interface ModelCatalogResponse {
  models: ModelInfo[];
  generatedAt: string;
}

export type ModelDescriptor = ModelInfo;

export function toInternalModelId(providerId: ProviderId, modelId: string): InternalModelId {
  return `${providerId}:${modelId}`;
}

export function fromInternalModelId(internalId: InternalModelId): {
  providerId: ProviderId;
  modelId: string;
} {
  const separatorIndex = internalId.indexOf(":");
  return {
    providerId: internalId.slice(0, separatorIndex) as ProviderId,
    modelId: internalId.slice(separatorIndex + 1),
  };
}

export function markModelUnavailable(
  model: ModelInfo,
  reason?: string,
): ModelInfo & { unavailableReason?: string } {
  return {
    ...model,
    isAvailable: false,
    unavailableReason: reason,
  };
}

export const bundledModelCatalog: ModelCatalogResponse = {
  generatedAt: "2026-06-07T00:00:00.000Z",
  models: [
    {
      id: "gpt-4.1-mini",
      internalId: "openai:gpt-4.1-mini",
      providerId: "openai",
      label: "GPT-4.1 mini",
      family: "OpenAI GPT-4.1",
      contextWindow: 1_000_000,
      isBundled: true,
      isAvailable: true,
      supportsToolUse: true,
      supportsVision: true,
    },
    {
      id: "gpt-4.1",
      internalId: "openai:gpt-4.1",
      providerId: "openai",
      label: "GPT-4.1",
      family: "OpenAI GPT-4.1",
      contextWindow: 1_000_000,
      isBundled: true,
      isAvailable: true,
      supportsToolUse: true,
      supportsVision: true,
    },
    {
      id: "anthropic/claude-sonnet-4",
      internalId: "openrouter:anthropic/claude-sonnet-4",
      providerId: "openrouter",
      label: "Claude Sonnet 4",
      family: "Anthropic Claude",
      contextWindow: 200_000,
      isBundled: true,
      isAvailable: true,
      supportsToolUse: true,
      supportsVision: true,
      openRouterRoute: {
        routedProvider: "anthropic",
        routedModelId: "claude-sonnet-4",
      },
    },
    {
      id: "anthropic/claude-3.5-haiku",
      internalId: "openrouter:anthropic/claude-3.5-haiku",
      providerId: "openrouter",
      label: "Claude 3.5 Haiku",
      family: "Anthropic Claude",
      contextWindow: 200_000,
      isBundled: true,
      isAvailable: true,
      openRouterRoute: {
        routedProvider: "anthropic",
        routedModelId: "claude-3.5-haiku",
      },
    },
    {
      id: "google/gemini-2.5-pro",
      internalId: "openrouter:google/gemini-2.5-pro",
      providerId: "openrouter",
      label: "Gemini 2.5 Pro",
      family: "Google Gemini",
      contextWindow: 1_000_000,
      isBundled: true,
      isAvailable: true,
      supportsToolUse: true,
      supportsVision: true,
      openRouterRoute: {
        routedProvider: "google",
        routedModelId: "gemini-2.5-pro",
      },
    },
    {
      id: "google/gemini-2.5-flash",
      internalId: "openrouter:google/gemini-2.5-flash",
      providerId: "openrouter",
      label: "Gemini 2.5 Flash",
      family: "Google Gemini",
      contextWindow: 1_000_000,
      isBundled: true,
      isAvailable: true,
      supportsToolUse: true,
      supportsVision: true,
      openRouterRoute: {
        routedProvider: "google",
        routedModelId: "gemini-2.5-flash",
      },
    },
  ],
};

export function getBundledModelCatalog(): ModelCatalogResponse {
  return bundledModelCatalog;
}

export function getVisibleModels(options: {
  hiddenModelIds?: readonly InternalModelId[];
  favoriteModelIds?: readonly InternalModelId[];
  catalog?: ModelCatalogResponse;
}): ModelInfo[] {
  const catalog = options.catalog ?? bundledModelCatalog;
  const hiddenModelIds = new Set(options.hiddenModelIds ?? []);
  const favoriteModelIds = new Set(options.favoriteModelIds ?? []);

  return catalog.models
    .filter((model) => !hiddenModelIds.has(model.internalId))
    .toSorted((left, right) => {
      const leftFavorite = favoriteModelIds.has(left.internalId);
      const rightFavorite = favoriteModelIds.has(right.internalId);

      if (leftFavorite !== rightFavorite) {
        return leftFavorite ? -1 : 1;
      }

      if (left.providerId !== right.providerId) {
        return left.providerId.localeCompare(right.providerId);
      }

      return left.label.localeCompare(right.label);
    });
}
