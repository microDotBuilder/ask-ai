import { describe, expect, it } from "vitest";
import {
  apiKeyEncryptionKeyStorageKey,
  apiKeyStoragePrefix,
  decodeBytes,
  decryptApiKey,
  defaultSettings,
  encodeBytes,
  encryptApiKey,
  exportApiKeyEncryptionKey,
  generateApiKeyEncryptionKey,
  importApiKeyEncryptionKey,
  parseSettings,
  readApiKeyEncryptionKey,
  readEncryptedApiKey,
  readSettings,
  removeEncryptedApiKey,
  saveEncryptedApiKey,
  writeApiKeyEncryptionKey,
  writeSettings,
  type ApiKeyStorageArea,
  type SettingsStorageArea,
} from "../src";

function createStorageArea(): ApiKeyStorageArea & SettingsStorageArea {
  const records: Record<string, unknown> = {};

  return {
    async get(keys) {
      if (keys === undefined || keys === null) {
        return { ...records };
      }

      if (typeof keys === "string") {
        return { [keys]: records[keys] };
      }

      if (Array.isArray(keys)) {
        return Object.fromEntries(keys.map((key) => [key, records[key]]));
      }

      return Object.fromEntries(
        Object.entries(keys).map(([key, fallback]) => [key, records[key] ?? fallback]),
      );
    },
    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        delete records[key];
      }
    },
    async set(items) {
      Object.assign(records, items);
    },
  };
}

describe("settings storage", () => {
  it("merges partial settings over defaults and nested retention defaults", () => {
    expect(
      parseSettings({
        defaultProviderId: "openrouter",
        retention: {
          maxAgeDays: 7,
        },
      }),
    ).toMatchObject({
      ...defaultSettings,
      defaultProviderId: "openrouter",
      retention: {
        ...defaultSettings.retention,
        maxAgeDays: 7,
      },
    });
  });

  it("round-trips validated settings through storage", async () => {
    const storage = createStorageArea();
    const settings = {
      ...defaultSettings,
      excludedSites: ["example.com"],
      saveHistory: false,
    };

    await writeSettings(storage, settings);

    await expect(readSettings(storage)).resolves.toMatchObject(settings);
  });
});

describe("API key encryption helpers", () => {
  it("encodes and decodes bytes", () => {
    const bytes = new Uint8Array([1, 2, 3, 255]);

    expect(decodeBytes(encodeBytes(bytes))).toEqual(bytes);
  });

  it("encrypts, validates, stores, reads, and decrypts API key records", async () => {
    const storage = createStorageArea();
    const key = await generateApiKeyEncryptionKey();
    const encodedKey = await exportApiKeyEncryptionKey(key);
    const importedKey = await importApiKeyEncryptionKey(encodedKey);
    const record = await encryptApiKey("openai", "sk-secret", importedKey);

    expect(record).toMatchObject({
      id: "openai",
      providerId: "openai",
    });
    expect(record.ciphertext).not.toContain("sk-secret");

    await writeApiKeyEncryptionKey(storage, encodedKey);
    await saveEncryptedApiKey(storage, record);

    await expect(readApiKeyEncryptionKey(storage)).resolves.toBe(encodedKey);
    await expect(readEncryptedApiKey(storage, "openai")).resolves.toEqual(record);
    await expect(decryptApiKey(record, importedKey)).resolves.toBe("sk-secret");

    await removeEncryptedApiKey(storage, "openai");
    await expect(readEncryptedApiKey(storage, "openai")).resolves.toBeUndefined();
  });

  it("rejects invalid encrypted API key records from storage", async () => {
    const storage = createStorageArea();

    await storage.set({
      [apiKeyEncryptionKeyStorageKey]: "encoded-key",
      [`${apiKeyStoragePrefix}.openai`]: {
        id: "openai",
        providerId: "unsupported",
        ciphertext: "ciphertext",
        iv: "iv",
        createdAt: "2026-06-07T00:00:00.000Z",
        updatedAt: "2026-06-07T00:00:00.000Z",
      },
    });

    await expect(readEncryptedApiKey(storage, "openai")).rejects.toThrow();
  });
});
