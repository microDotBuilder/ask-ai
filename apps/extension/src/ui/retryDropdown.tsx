import type { InternalModelId, ModelInfo, ProviderId } from "@askai/core";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ModelProviderGroup, ModelProviderId } from "../types/types";
import { getModelProviderId, modelProviders } from "../utils/misc";

interface RetryDropdownProps {
  models: ModelInfo[];
  currentModelId?: InternalModelId;
  onRetrySame: () => void;
  onRetryWithModel: (providerId: ProviderId, modelId: InternalModelId) => void;
  onClose: () => void;
}

export function RetryDropdown({
  models,
  currentModelId,
  onRetrySame,
  onRetryWithModel,
  onClose,
}: RetryDropdownProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [expandedProviderId, setExpandedProviderId] = useState<ModelProviderId | null>(null);

  const providerGroups = useMemo<ModelProviderGroup[]>(
    () =>
      modelProviders.map((provider) => ({
        ...provider,
        models: models.filter(
          (model) => model.internalId && getModelProviderId(model) === provider.id,
        ),
      })),
    [models],
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  const expandedProvider = expandedProviderId
    ? providerGroups.find((provider) => provider.id === expandedProviderId)
    : null;

  return (
    <div className="retry-dropdown" ref={containerRef} role="menu">
      {expandedProvider ? (
        <>
          <button
            className="retry-dropdown-back"
            onClick={() => setExpandedProviderId(null)}
            type="button"
          >
            <ChevronLeft size={14} aria-hidden="true" />
            <img src={expandedProvider.iconSrc} alt="" />
            <span>{expandedProvider.name}</span>
          </button>
          <div className="retry-dropdown-divider" />
          <div className="retry-dropdown-models">
            {expandedProvider.models.length ? (
              expandedProvider.models.map((model) => {
                const isCurrent = model.internalId === currentModelId;
                return (
                  <button
                    className="retry-dropdown-model"
                    data-current={isCurrent || undefined}
                    disabled={!model.isAvailable}
                    key={model.internalId}
                    onClick={() => {
                      onRetryWithModel(model.providerId, model.internalId);
                      onClose();
                    }}
                    role="menuitem"
                    type="button"
                  >
                    <span>{model.label}</span>
                    {isCurrent ? <small>current</small> : null}
                  </button>
                );
              })
            ) : (
              <p className="retry-dropdown-empty">No models available.</p>
            )}
          </div>
        </>
      ) : (
        <>
          <button
            className="retry-dropdown-action"
            onClick={() => {
              onRetrySame();
              onClose();
            }}
            role="menuitem"
            type="button"
          >
            <RefreshCw size={14} aria-hidden="true" />
            <span>Retry same</span>
          </button>
          <div className="retry-dropdown-divider">
            <span>or switch model</span>
          </div>
          <div className="retry-dropdown-providers">
            {providerGroups.map((provider) => {
              const disabled = provider.models.length === 0;
              return (
                <button
                  className="retry-dropdown-provider"
                  disabled={disabled}
                  key={provider.id}
                  onClick={() => setExpandedProviderId(provider.id)}
                  role="menuitem"
                  type="button"
                >
                  <img src={provider.iconSrc} alt="" />
                  <span>{provider.name}</span>
                  <ChevronRight size={14} aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
