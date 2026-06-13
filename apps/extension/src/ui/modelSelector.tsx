import type { InternalModelId, ModelInfo } from "@askai/core";
import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { useSidepanelStore } from "../../store/sidepanelstore";
import type { ModelProviderGroup, ModelProviderId } from "../types/types";
import {
  fallbackModelProviderGroup,
  getModelProviderId,
  getProviderDetails,
  modelProviders,
} from "../utils/misc";
export function ModelSelector({
  disabled,
  favoriteModelIds,
  models,
  onModelChange,
  selectedModelId,
}: {
  disabled: boolean;
  favoriteModelIds: readonly InternalModelId[];
  models: ModelInfo[];
  onModelChange: (modelId: InternalModelId) => void;
  selectedModelId: InternalModelId;
}) {
  const open = useSidepanelStore((state) => state.modelSelectorOpen);
  const searchTerm = useSidepanelStore((state) => state.modelSelectorSearchTerm);
  const activeProviderId = useSidepanelStore((state) => state.modelSelectorActiveProviderId);
  const setOpen = useSidepanelStore((state) => state.setModelSelectorOpen);
  const setSearchTerm = useSidepanelStore((state) => state.setModelSelectorSearchTerm);
  const setActiveProviderId = useSidepanelStore((state) => state.setModelSelectorActiveProviderId);
  const controlRef = useRef<HTMLElement | null>(null);
  const selectableModels = useMemo(() => models.filter((model) => model.internalId), [models]);
  const providerGroups = useMemo<ModelProviderGroup[]>(
    () =>
      modelProviders.map((provider) => ({
        ...provider,
        models: selectableModels.filter((model) => getModelProviderId(model) === provider.id),
      })),
    [selectableModels],
  );
  const selectedModel = selectableModels.find((model) => model.internalId === selectedModelId);
  const selectedProviderId = selectedModel
    ? getModelProviderId(selectedModel)
    : (providerGroups.find((provider) => provider.models.length)?.id ?? "openai");
  const activeProvider =
    providerGroups.find((provider) => provider.id === activeProviderId) ??
    providerGroups.find((provider) => provider.id === selectedProviderId) ??
    fallbackModelProviderGroup;
  const selectedProvider = selectedModel ? getProviderDetails(selectedProviderId) : undefined;
  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  const visibleModels = activeProvider.models.filter((model) => {
    const searchable = `${model.label} ${model.family} ${model.id}`.toLowerCase();
    return searchable.includes(normalizedSearchTerm);
  });
  const triggerDisabled = disabled || selectableModels.length === 0;

  useEffect(() => {
    if (!open) {
      setActiveProviderId(selectedProviderId as ModelProviderId);
      setSearchTerm("");
    }
  }, [open, selectedProviderId, setActiveProviderId, setSearchTerm]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (controlRef.current?.contains(event.target as Node)) {
        return;
      }

      setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, setOpen]);

  return (
    <section ref={controlRef} className="model-selector">
      <span id="model-selector-label" className="sr-only">
        Model
      </span>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-labelledby="model-selector-label model-selector-value"
        className="model-trigger"
        disabled={triggerDisabled}
        onClick={() => setOpen(!open)}
        type="button"
      >
        {selectedProvider ? (
          <img className="model-trigger-icon" src={selectedProvider.iconSrc} alt="" />
        ) : null}
        <span id="model-selector-value">{selectedModel?.label ?? "Select model"}</span>
        <ChevronDown className="model-trigger-chevron" size={13} aria-hidden="true" />
      </button>

      {open ? (
        <div className="model-popover" role="dialog" aria-label="Choose model">
          <div className="model-provider-rail" role="tablist" aria-label="Companies">
            {providerGroups.map((provider) => {
              const emptyProvider = provider.models.length === 0;
              const tooltip = emptyProvider
                ? (provider.emptyTooltip ?? "Models coming soon")
                : provider.name;

              return (
                <button
                  aria-disabled={emptyProvider}
                  aria-selected={provider.id === activeProvider.id}
                  className="model-provider-tab"
                  data-active={provider.id === activeProvider.id}
                  data-empty={emptyProvider}
                  data-tooltip={tooltip}
                  key={provider.id}
                  onClick={() => {
                    if (!emptyProvider) {
                      setActiveProviderId(provider.id);
                      setSearchTerm("");
                    }
                  }}
                  role="tab"
                  title={tooltip}
                  type="button"
                >
                  <img src={provider.iconSrc} alt="" />
                  <span className="sr-only">{provider.name}</span>
                </button>
              );
            })}
          </div>

          <div className="model-options-pane">
            <label className="model-search">
              <span className="model-search-icon" aria-hidden="true" />
              <span className="sr-only">Search models</span>
              <input
                disabled={!activeProvider.models.length}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search models..."
                type="search"
                value={searchTerm}
              />
            </label>

            <div
              className="model-option-list"
              role="listbox"
              aria-label={`${activeProvider.name} models`}
            >
              {activeProvider.models.length ? (
                visibleModels.length ? (
                  visibleModels.map((model, index) => {
                    const favorite = favoriteModelIds.includes(model.internalId);
                    const selected = model.internalId === selectedModelId;

                    return (
                      <button
                        aria-selected={selected}
                        className="model-option-row"
                        data-selected={selected}
                        disabled={!model.isAvailable}
                        key={model.internalId}
                        onClick={() => {
                          onModelChange(model.internalId);
                          setOpen(false);
                        }}
                        role="option"
                        type="button"
                      >
                        <span
                          className="model-favorite"
                          data-favorite={favorite}
                          aria-hidden="true"
                        />
                        <span className="model-option-copy">
                          <strong>{model.label}</strong>
                          <small>
                            <img src={activeProvider.iconSrc} alt="" />
                            {activeProvider.name}
                          </small>
                        </span>
                        <span className="model-shortcut" aria-hidden="true">
                          #{index + 1}
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <p className="model-empty-state">No matching models.</p>
                )
              ) : (
                <div className="model-coming-soon" role="status">
                  <strong>{activeProvider.name}</strong>
                  <span>Models coming soon.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
