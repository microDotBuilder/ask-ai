import {
  apiKeyEncryptionKeyStorageKey,
  type AskAiSettings,
  defaultSettings,
  encryptApiKey,
  getBundledModelCatalog,
  getOrCreateApiKeyEncryptionKey,
  getVisibleModels,
  importApiKeyEncryptionKeyNonExtractable,
  type ModelInfo,
  type PendingQuickAction,
  type ProviderId,
  parsePendingQuickAction,
  readApiKeyEncryptionKey,
  readEncryptedApiKey,
  readSettings,
  removeEncryptedApiKey,
  resolveProviderRequestConfig,
  saveEncryptedApiKey,
  writeSettings,
} from "@askai/core";
import { createCryptoKeyStore, initializeDatabase } from "@askai/db";

export type { PendingQuickAction } from "@askai/core";

export interface ApiKeyStatus {
  openai: boolean;
  openrouter: boolean;
}

export interface StorageUsageView {
  usage?: number;
  quota?: number;
  persisted?: boolean;
}

export const pendingQuickActionStorageKey = "askai.pendingQuickAction";

export const uiHintsSeenStorageKey = "askai.uiHintsSeen";

export async function readUiHintsSeen(): Promise<boolean> {
  const record = await chrome.storage.local.get(uiHintsSeenStorageKey);
  return record[uiHintsSeenStorageKey] === true;
}

export async function markUiHintsSeen(): Promise<void> {
  await chrome.storage.local.set({ [uiHintsSeenStorageKey]: true });
}

export const providerLabels: Record<ProviderId, string> = {
  openai: "OpenAI",
  openrouter: "OpenRouter",
};

export function modelsForSettings(settings: AskAiSettings): ModelInfo[] {
  return getVisibleModels({
    hiddenModelIds: settings.hiddenModelIds,
    favoriteModelIds: settings.favoriteModelIds,
    catalog: getBundledModelCatalog(),
  });
}

export async function loadSettings(): Promise<AskAiSettings> {
  return readSettings(chrome.storage.local);
}

export async function saveSettings(settings: AskAiSettings): Promise<void> {
  await writeSettings(chrome.storage.local, settings);
}

export async function updateSettings(
  updater: (settings: AskAiSettings) => AskAiSettings,
): Promise<AskAiSettings> {
  const current = await loadSettings();
  const next = updater(current);
  await saveSettings(next);
  return next;
}

export async function readApiKeyStatus(): Promise<ApiKeyStatus> {
  const [openai, openrouter] = await Promise.all([
    readEncryptedApiKey(chrome.storage.local, "openai"),
    readEncryptedApiKey(chrome.storage.local, "openrouter"),
  ]);

  return {
    openai: Boolean(openai),
    openrouter: Boolean(openrouter),
  };
}

async function getOrCreateEncryptionKey(): Promise<CryptoKey> {
  await initializeDatabase();
  const store = createCryptoKeyStore();

  // One-time migration: if a legacy raw-key copy lives in `chrome.storage.local`,
  // re-import it as a non-extractable CryptoKey in IndexedDB and remove the
  // legacy copy. Existing ciphertexts decrypt unchanged.
  const legacy = await readApiKeyEncryptionKey(chrome.storage.local);
  if (legacy) {
    const migrated = await importApiKeyEncryptionKeyNonExtractable(legacy);
    await store.put("askai.apiKey.encryptionKey", migrated);
    await chrome.storage.local.remove(apiKeyEncryptionKeyStorageKey);
    return migrated;
  }

  return getOrCreateApiKeyEncryptionKey(store);
}

export async function getApiKeyEncryptionKey(): Promise<CryptoKey> {
  return getOrCreateEncryptionKey();
}

export async function saveProviderApiKey(providerId: ProviderId, apiKey: string): Promise<void> {
  const key = await getOrCreateEncryptionKey();
  const encrypted = await encryptApiKey(providerId, apiKey.trim(), key);
  await saveEncryptedApiKey(chrome.storage.local, encrypted);
}

export async function clearProviderApiKey(providerId: ProviderId): Promise<void> {
  await removeEncryptedApiKey(chrome.storage.local, providerId);
}

export async function testProviderConnection(
  providerId: ProviderId,
  apiKey: string,
): Promise<{ ok: boolean; message: string }> {
  const defaultModelId =
    getBundledModelCatalog().models.find((model) => model.providerId === providerId)?.internalId ??
    defaultSettings.defaultModelId;
  const config = resolveProviderRequestConfig({
    internalModelId: defaultModelId,
    apiKey: apiKey.trim(),
    appTitle: "Ask AI",
    appUrl: chrome.runtime.getURL(""),
  });

  try {
    const response = await fetch(`${config.baseUrl}/models`, {
      method: "GET",
      headers: config.headers,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        ok: false,
        message: body || `Connection failed with HTTP ${response.status}.`,
      };
    }

    return { ok: true, message: `${providerLabels[providerId]} connection works.` };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Connection test failed.",
    };
  }
}

export async function requestHistoryPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) {
    return false;
  }

  return navigator.storage.persist();
}

export async function readStorageUsage(): Promise<StorageUsageView> {
  const [estimate, persisted] = await Promise.all([
    navigator.storage?.estimate?.(),
    navigator.storage?.persisted?.(),
  ]);

  return {
    usage: estimate?.usage,
    quota: estimate?.quota,
    persisted,
  };
}

export async function storePendingQuickAction(action: PendingQuickAction): Promise<void> {
  await chrome.storage.session.set({
    [pendingQuickActionStorageKey]: parsePendingQuickAction(action),
  });
}

export async function clearPendingQuickAction(): Promise<void> {
  await chrome.storage.session.remove(pendingQuickActionStorageKey);
}

export async function takePendingQuickAction(): Promise<PendingQuickAction | undefined> {
  const record = await chrome.storage.session.get(pendingQuickActionStorageKey);
  await clearPendingQuickAction();
  const action = record[pendingQuickActionStorageKey];

  if (action === undefined) {
    return undefined;
  }

  try {
    return parsePendingQuickAction(action);
  } catch {
    return undefined;
  }
}
