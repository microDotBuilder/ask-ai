import { describe, expect, it } from "vitest";
import {
  bundledModelCatalog,
  fromInternalModelId,
  getVisibleModels,
  markModelUnavailable,
  toInternalModelId,
} from "../src";

describe("model catalog helpers", () => {
  it("round-trips provider-prefixed internal model ids", () => {
    const internalId = toInternalModelId("openrouter", "anthropic/claude-sonnet-4");

    expect(internalId).toBe("openrouter:anthropic/claude-sonnet-4");
    expect(fromInternalModelId(internalId)).toEqual({
      providerId: "openrouter",
      modelId: "anthropic/claude-sonnet-4",
    });
  });

  it("hides disabled models and sorts favorites first", () => {
    const visibleModels = getVisibleModels({
      hiddenModelIds: ["openai:gpt-4.1"],
      favoriteModelIds: ["openrouter:google/gemini-2.5-flash"],
    });

    expect(visibleModels.map((model) => model.internalId)).not.toContain("openai:gpt-4.1");
    expect(visibleModels[0]?.internalId).toBe("openrouter:google/gemini-2.5-flash");
  });

  it("keeps routed OpenRouter metadata for Anthropic and Gemini models", () => {
    const routedModels = bundledModelCatalog.models.filter((model) => model.openRouterRoute);

    expect(routedModels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          internalId: "openrouter:anthropic/claude-sonnet-4",
          openRouterRoute: {
            routedProvider: "anthropic",
            routedModelId: "claude-sonnet-4",
          },
        }),
        expect.objectContaining({
          internalId: "openrouter:google/gemini-2.5-pro",
          openRouterRoute: {
            routedProvider: "google",
            routedModelId: "gemini-2.5-pro",
          },
        }),
      ]),
    );
  });

  it("marks unavailable models without mutating the source model", () => {
    const model = bundledModelCatalog.models[0];
    const unavailable = markModelUnavailable(model, "Retired upstream");

    expect(model?.isAvailable).toBe(true);
    expect(unavailable).toMatchObject({
      isAvailable: false,
      unavailableReason: "Retired upstream",
    });
  });
});
