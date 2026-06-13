import type { AskAiSettings, InternalModelId, ProviderId } from "@askai/core";
import { Sparkles } from "lucide-react";
import { useEffect } from "react";
import { useSidepanelStore } from "../../store/sidepanelstore";
import { getVisibleSetupModels } from "../utils/misc";

export function SetupPanel({ settings }: { settings: AskAiSettings }) {
  const setupDraft = useSidepanelStore((state) => state.setupDraft);
  const initializeSetupDraft = useSidepanelStore((state) => state.initializeSetupDraft);
  const setSetupProviderId = useSidepanelStore((state) => state.setSetupProviderId);
  const setSetupModelId = useSidepanelStore((state) => state.setSetupModelId);
  const setSetupApiKey = useSidepanelStore((state) => state.setSetupApiKey);
  const submitSetup = useSidepanelStore((state) => state.submitSetup);

  useEffect(() => {
    initializeSetupDraft(settings);
  }, [initializeSetupDraft, settings]);

  const providerId = setupDraft?.providerId ?? settings.defaultProviderId;
  const modelId = setupDraft?.modelId ?? settings.defaultModelId;
  const apiKey = setupDraft?.apiKey ?? "";
  const status = setupDraft?.status ?? null;
  const busy = setupDraft?.busy ?? false;
  const models = getVisibleSetupModels(providerId);

  useEffect(() => {
    const firstProviderModel = models.find((model) => model.internalId === modelId) ?? models[0];
    if (firstProviderModel && firstProviderModel.internalId !== modelId) {
      setSetupModelId(firstProviderModel.internalId);
    }
  }, [modelId, models, setSetupModelId]);

  return (
    <main className="setup-shell">
      <header className="setup-header">
        <Sparkles size={18} aria-hidden="true" />
        <div>
          <h1>Set up Ask AI</h1>
          <p>Connect a provider to start chatting with the current tab.</p>
        </div>
      </header>

      <section className="setup-card">
        <div>
          <h2>Bring your own API key</h2>
          <p>
            Ask AI stores your key encrypted in this browser and sends requests directly to the
            provider you choose.
          </p>
        </div>

        <label>
          <span>Provider</span>
          <select
            onChange={(event) => setSetupProviderId(event.target.value as ProviderId)}
            value={providerId}
          >
            <option value="openai">OpenAI</option>
            <option value="openrouter">OpenRouter</option>
          </select>
        </label>

        <label>
          <span>API key</span>
          <input
            onChange={(event) => setSetupApiKey(event.target.value)}
            placeholder={providerId === "openai" ? "sk-..." : "sk-or-..."}
            type="password"
            value={apiKey}
          />
        </label>

        <label>
          <span>Default model</span>
          <select
            onChange={(event) => setSetupModelId(event.target.value as InternalModelId)}
            value={modelId}
          >
            {models.map((model) => (
              <option key={model.internalId} value={model.internalId}>
                {model.label} - {model.family}
              </option>
            ))}
          </select>
        </label>

        {status ? <p className="setup-status">{status}</p> : null}

        <button
          className="primary-button"
          disabled={busy}
          onClick={() => void submitSetup(settings)}
          type="button"
        >
          {busy ? "Checking..." : "Test and finish setup"}
        </button>
      </section>

      <button
        className="quiet-link-button"
        onClick={() => chrome.runtime.openOptionsPage()}
        type="button"
      >
        Open advanced settings
      </button>
    </main>
  );
}
