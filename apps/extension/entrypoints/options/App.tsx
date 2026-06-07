import {
  type AskAiSettings,
  defaultSettings,
  getBundledModelCatalog,
  type InternalModelId,
  type ProviderId,
} from "@askai/core";
import { Settings } from "@askai/ui";
import { useEffect, useMemo, useState } from "react";
import {
  type ApiKeyStatus,
  clearProviderApiKey,
  loadSettings,
  modelsForSettings,
  providerLabels,
  readApiKeyStatus,
  readStorageUsage,
  requestHistoryPersistence,
  type StorageUsageView,
  saveProviderApiKey,
  saveSettings,
  testProviderConnection,
} from "../../src/product";

type ProviderKeyDrafts = Record<ProviderId, string>;
type ProviderMessages = Partial<Record<ProviderId, string>>;

function formatBytes(bytes?: number): string {
  if (bytes === undefined) {
    return "Unknown";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function parseSiteList(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((site) => site.trim())
    .filter(Boolean);
}

function addModelId(ids: readonly InternalModelId[], id: InternalModelId): InternalModelId[] {
  return ids.includes(id) ? [...ids] : [...ids, id];
}

function removeModelId(ids: readonly InternalModelId[], id: InternalModelId): InternalModelId[] {
  return ids.filter((existingId) => existingId !== id);
}

export function App() {
  const [settings, setSettings] = useState<AskAiSettings | null>(null);
  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatus | null>(null);
  const [storageUsage, setStorageUsage] = useState<StorageUsageView>({});
  const [keyDrafts, setKeyDrafts] = useState<ProviderKeyDrafts>({ openai: "", openrouter: "" });
  const [providerMessages, setProviderMessages] = useState<ProviderMessages>({});
  const [excludedSitesDraft, setExcludedSitesDraft] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [nextSettings, nextApiKeyStatus, nextStorageUsage] = await Promise.all([
        loadSettings(),
        readApiKeyStatus(),
        readStorageUsage(),
      ]);
      setSettings(nextSettings);
      setApiKeyStatus(nextApiKeyStatus);
      setStorageUsage(nextStorageUsage);
      setExcludedSitesDraft(nextSettings.excludedSites.join("\n"));
    }

    void load();
  }, []);

  const allModels = useMemo(() => getBundledModelCatalog().models, []);
  const visibleModels = useMemo(() => (settings ? modelsForSettings(settings) : []), [settings]);

  const persistSettings = async (nextSettings: AskAiSettings) => {
    setSettings(nextSettings);
    await saveSettings(nextSettings);
    setStatus("Settings saved.");
  };

  const updateSettings = (updater: (current: AskAiSettings) => AskAiSettings) => {
    if (!settings) {
      return;
    }

    void persistSettings(updater(settings));
  };

  const saveKey = async (providerId: ProviderId) => {
    const apiKey = keyDrafts[providerId].trim();

    if (!apiKey) {
      setProviderMessages((current) => ({
        ...current,
        [providerId]: "Enter an API key first.",
      }));
      return;
    }

    setProviderMessages((current) => ({
      ...current,
      [providerId]: "Testing provider connection...",
    }));

    const test = await testProviderConnection(providerId, apiKey);
    if (!test.ok) {
      setProviderMessages((current) => ({ ...current, [providerId]: test.message }));
      return;
    }

    await saveProviderApiKey(providerId, apiKey);
    setKeyDrafts((current) => ({ ...current, [providerId]: "" }));
    setApiKeyStatus(await readApiKeyStatus());
    setProviderMessages((current) => ({ ...current, [providerId]: test.message }));
  };

  const clearKey = async (providerId: ProviderId) => {
    await clearProviderApiKey(providerId);
    setApiKeyStatus(await readApiKeyStatus());
    setProviderMessages((current) => ({
      ...current,
      [providerId]: `${providerLabels[providerId]} key removed.`,
    }));
  };

  if (!settings || !apiKeyStatus) {
    return (
      <main className="settings-loading">
        <p>Loading settings...</p>
      </main>
    );
  }

  return (
    <main className="settings-shell">
      <div className="settings-page">
        <div className="settings-header">
          <div className="settings-title">
            <Settings className="size-5" aria-hidden="true" />
            <div>
              <h1>Ask AI Options</h1>
              <p>Configure providers, models, context, and privacy.</p>
            </div>
          </div>
          {status ? <p className="save-status">{status}</p> : null}
        </div>

        <section className="settings-section">
          <div className="section-heading">
            <h2>Provider keys</h2>
            <p>Securely store the keys used by chat requests.</p>
          </div>
          <div className="provider-grid">
            {(["openai", "openrouter"] as const).map((providerId) => (
              <div className="provider-card" key={providerId}>
                <div className="provider-card-header">
                  <h3>{providerLabels[providerId]}</h3>
                  <span
                    className="status-pill"
                    data-state={apiKeyStatus[providerId] ? "saved" : "missing"}
                  >
                    {apiKeyStatus[providerId] ? "Saved" : "Missing"}
                  </span>
                </div>
                <input
                  className="text-input"
                  onChange={(event) =>
                    setKeyDrafts((current) => ({
                      ...current,
                      [providerId]: event.target.value,
                    }))
                  }
                  placeholder={providerId === "openai" ? "sk-..." : "sk-or-..."}
                  type="password"
                  value={keyDrafts[providerId]}
                />
                <div className="button-row">
                  <button
                    className="primary-button"
                    onClick={() => void saveKey(providerId)}
                    type="button"
                  >
                    Test and save
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => void clearKey(providerId)}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
                {providerMessages[providerId] ? (
                  <p className="inline-status">{providerMessages[providerId]}</p>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        <section className="settings-section">
          <div className="section-heading">
            <h2>Default model</h2>
            <p>Choose the model used by the sidepanel composer.</p>
          </div>
          <div className="settings-grid">
            <label className="field">
              <span>Default provider</span>
              <select
                className="select-input"
                onChange={(event) => {
                  const providerId = event.target.value as ProviderId;
                  const model =
                    visibleModels.find((item) => item.providerId === providerId) ??
                    allModels.find((item) => item.providerId === providerId);

                  if (!model) {
                    return;
                  }

                  updateSettings((current) => ({
                    ...current,
                    defaultProviderId: providerId,
                    defaultModelId: model.internalId,
                  }));
                }}
                value={settings.defaultProviderId}
              >
                <option value="openai">OpenAI</option>
                <option value="openrouter">OpenRouter</option>
              </select>
            </label>

            <label className="field">
              <span>Default model</span>
              <select
                className="select-input"
                onChange={(event) => {
                  const modelId = event.target.value as InternalModelId;
                  const model = allModels.find((item) => item.internalId === modelId);

                  if (!model) {
                    return;
                  }

                  updateSettings((current) => ({
                    ...current,
                    defaultProviderId: model.providerId,
                    defaultModelId: model.internalId,
                  }));
                }}
                value={settings.defaultModelId}
              >
                {visibleModels.map((model) => (
                  <option key={model.internalId} value={model.internalId}>
                    {settings.favoriteModelIds.includes(model.internalId) ? "★ " : ""}
                    {model.label} - {providerLabels[model.providerId]} - {model.family}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="settings-section">
          <div className="section-heading">
            <h2>Model visibility and favorites</h2>
            <p>Control which models appear in selectors and pin favorites near the top.</p>
          </div>
          <div className="model-list">
            {allModels.map((model) => {
              const hidden = settings.hiddenModelIds.includes(model.internalId);
              const favorite = settings.favoriteModelIds.includes(model.internalId);

              return (
                <div className="model-row" key={model.internalId}>
                  <div className="model-copy">
                    <p>{model.label}</p>
                    <small>
                      {providerLabels[model.providerId]} · {model.family} ·{" "}
                      {model.contextWindow.toLocaleString()} context
                    </small>
                  </div>
                  <div className="toggle-row">
                    <label className="check-control">
                      <input
                        checked={!hidden}
                        onChange={(event) => {
                          updateSettings((current) => ({
                            ...current,
                            hiddenModelIds: event.target.checked
                              ? removeModelId(current.hiddenModelIds, model.internalId)
                              : addModelId(current.hiddenModelIds, model.internalId),
                          }));
                        }}
                        type="checkbox"
                      />
                      <span>Visible</span>
                    </label>
                    <label className="check-control">
                      <input
                        checked={favorite}
                        onChange={(event) => {
                          updateSettings((current) => ({
                            ...current,
                            favoriteModelIds: event.target.checked
                              ? addModelId(current.favoriteModelIds, model.internalId)
                              : removeModelId(current.favoriteModelIds, model.internalId),
                          }));
                        }}
                        type="checkbox"
                      />
                      <span>Favorite</span>
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="settings-grid settings-grid-spaced">
          <div className="settings-section">
            <div className="section-heading">
              <h2>Context and history</h2>
              <p>Tune context size and retention behavior.</p>
            </div>
            <label className="field">
              <span>Context token cap</span>
              <input
                className="text-input"
                min={4_000}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (Number.isFinite(value)) {
                    updateSettings((current) => ({ ...current, contextTokenCap: value }));
                  }
                }}
                step={1_000}
                type="number"
                value={settings.contextTokenCap}
              />
            </label>
            <label className="check-control check-control-block">
              <input
                checked={settings.saveHistory}
                onChange={(event) => {
                  updateSettings((current) => ({ ...current, saveHistory: event.target.checked }));
                  if (event.target.checked) {
                    void requestHistoryPersistence().then(async () =>
                      setStorageUsage(await readStorageUsage()),
                    );
                  }
                }}
                type="checkbox"
              />
              <span>Save chat history</span>
            </label>
            <div className="settings-grid settings-grid-tight">
              <label className="field">
                <span>Max conversations</span>
                <input
                  className="text-input"
                  min={1}
                  onChange={(event) =>
                    updateSettings((current) => ({
                      ...current,
                      retention: {
                        ...current.retention,
                        maxConversations: Number(event.target.value),
                      },
                    }))
                  }
                  type="number"
                  value={settings.retention.maxConversations}
                />
              </label>
              <label className="field">
                <span>Max age days</span>
                <input
                  className="text-input"
                  min={1}
                  onChange={(event) =>
                    updateSettings((current) => ({
                      ...current,
                      retention: { ...current.retention, maxAgeDays: Number(event.target.value) },
                    }))
                  }
                  type="number"
                  value={settings.retention.maxAgeDays}
                />
              </label>
            </div>
            <label className="check-control check-control-block">
              <input
                checked={settings.retention.prunePinned}
                onChange={(event) =>
                  updateSettings((current) => ({
                    ...current,
                    retention: { ...current.retention, prunePinned: event.target.checked },
                  }))
                }
                type="checkbox"
              />
              <span>Include pinned chats when pruning</span>
            </label>
          </div>

          <div className="settings-section">
            <div className="section-heading">
              <h2>Storage usage</h2>
              <p>Browser quota and persistent-storage state.</p>
            </div>
            <dl className="usage-list">
              <div>
                <dt>Used</dt>
                <dd>{formatBytes(storageUsage.usage)}</dd>
              </div>
              <div>
                <dt>Quota</dt>
                <dd>{formatBytes(storageUsage.quota)}</dd>
              </div>
              <div>
                <dt>Persistent</dt>
                <dd>{storageUsage.persisted ? "Granted" : "Not granted"}</dd>
              </div>
            </dl>
            <button
              className="secondary-button"
              onClick={async () => {
                await requestHistoryPersistence();
                setStorageUsage(await readStorageUsage());
              }}
              type="button"
            >
              Request persistent storage
            </button>
          </div>
        </section>

        <section className="settings-section">
          <div className="section-heading">
            <h2>Privacy and suggestions</h2>
            <p>Exclude private pages and configure lightweight assistant prompts.</p>
          </div>
          <label className="field">
            <span>Excluded sites</span>
            <textarea
              className="text-input textarea-input"
              onBlur={() =>
                updateSettings((current) => ({
                  ...current,
                  excludedSites: parseSiteList(excludedSitesDraft),
                }))
              }
              onChange={(event) => setExcludedSitesDraft(event.target.value)}
              placeholder={"example.com\nhttps://private.example.com/path"}
              value={excludedSitesDraft}
            />
          </label>
          <label className="check-control check-control-block">
            <input
              checked={settings.aiSuggestionsEnabled}
              onChange={(event) =>
                updateSettings((current) => ({
                  ...current,
                  aiSuggestionsEnabled: event.target.checked,
                }))
              }
              type="checkbox"
            />
            <span>Show AI suggestions placeholder</span>
          </label>
          <button
            className="secondary-button danger-button"
            onClick={() => void persistSettings(defaultSettings)}
            type="button"
          >
            Reset settings
          </button>
        </section>
      </div>
    </main>
  );
}
