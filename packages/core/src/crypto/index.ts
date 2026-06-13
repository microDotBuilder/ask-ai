import * as Schema from "effect/Schema";
import type { ProviderId } from "../types";

const algorithmName = "AES-GCM";
const keyUsages: KeyUsage[] = ["encrypt", "decrypt"];
const ivByteLength = 12;

function decodesAsBase64(value: string): boolean {
  if (!value) {
    return false;
  }
  try {
    atob(value);
    return true;
  } catch {
    return false;
  }
}

const Base64String = Schema.String.pipe(
  Schema.filter(decodesAsBase64, { message: () => "value must be base64-encoded" }),
);

const IvString = Base64String.pipe(
  Schema.filter(
    (value) => {
      try {
        return atob(value).length === ivByteLength;
      } catch {
        return false;
      }
    },
    { message: () => `iv must decode to exactly ${ivByteLength} bytes` },
  ),
);

export const EncryptedApiKeyRecordSchema = Schema.Struct({
  id: Schema.String,
  providerId: Schema.Literal("openai", "openrouter"),
  ciphertext: Base64String,
  iv: IvString,
  createdAt: Schema.String,
  updatedAt: Schema.String,
});

export type EncryptedApiKeyRecord = Schema.Schema.Type<typeof EncryptedApiKeyRecordSchema>;

export interface ApiKeyStorageArea {
  get(keys?: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

export interface CryptoKeyStore {
  get(id: string): Promise<CryptoKey | undefined>;
  put(id: string, key: CryptoKey): Promise<void>;
  delete(id: string): Promise<void>;
}

export const apiKeyStoragePrefix = "askai.apiKey";
/** @deprecated Encryption keys now live in IndexedDB as non-extractable CryptoKeys. */
export const apiKeyEncryptionKeyStorageKey = "askai.apiKey.encryptionKey";
export const apiKeyEncryptionCryptoKeyId = "askai.apiKey.encryptionKey";

export function encodeBytes(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

export function decodeBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/**
 * @deprecated Returns an extractable key. Use
 * `generateApiKeyEncryptionKeyNonExtractable` for production code paths so the
 * raw key bytes never reach JavaScript.
 */
export async function generateApiKeyEncryptionKey(
  cryptoApi: Crypto = globalThis.crypto,
): Promise<CryptoKey> {
  return cryptoApi.subtle.generateKey({ name: algorithmName, length: 256 }, true, keyUsages);
}

/**
 * Generate a non-extractable AES-GCM key. The raw bytes never become available
 * to JavaScript, so even a compromised side-panel cannot read the key out of
 * storage and exfiltrate it.
 */
export async function generateApiKeyEncryptionKeyNonExtractable(
  cryptoApi: Crypto = globalThis.crypto,
): Promise<CryptoKey> {
  return cryptoApi.subtle.generateKey({ name: algorithmName, length: 256 }, false, keyUsages);
}

/**
 * Read the encryption key from the supplied store, generating and persisting a
 * new non-extractable key on first run.
 */
export async function getOrCreateApiKeyEncryptionKey(
  store: CryptoKeyStore,
  cryptoApi: Crypto = globalThis.crypto,
): Promise<CryptoKey> {
  const existing = await store.get(apiKeyEncryptionCryptoKeyId);
  if (existing) {
    return existing;
  }
  const key = await generateApiKeyEncryptionKeyNonExtractable(cryptoApi);
  await store.put(apiKeyEncryptionCryptoKeyId, key);
  return key;
}

/**
 * @deprecated Only useful for tests and legacy import paths — new code stores
 * non-extractable keys in IndexedDB instead.
 */
export async function exportApiKeyEncryptionKey(
  key: CryptoKey,
  cryptoApi: Crypto = globalThis.crypto,
): Promise<string> {
  const rawKey = await cryptoApi.subtle.exportKey("raw", key);
  return encodeBytes(new Uint8Array(rawKey));
}

/**
 * @deprecated Use `getOrCreateApiKeyEncryptionKey` with a `CryptoKeyStore`.
 * This path imports an extractable key, which is what the previous storage
 * model required; keep it only for migration of legacy records.
 */
export async function importApiKeyEncryptionKey(
  encodedKey: string,
  cryptoApi: Crypto = globalThis.crypto,
): Promise<CryptoKey> {
  return cryptoApi.subtle.importKey(
    "raw",
    toArrayBuffer(decodeBytes(encodedKey)),
    algorithmName,
    true,
    keyUsages,
  );
}

/**
 * Import a legacy encoded key as a non-extractable CryptoKey so it can be moved
 * out of `chrome.storage.local` without invalidating existing ciphertexts.
 */
export async function importApiKeyEncryptionKeyNonExtractable(
  encodedKey: string,
  cryptoApi: Crypto = globalThis.crypto,
): Promise<CryptoKey> {
  return cryptoApi.subtle.importKey(
    "raw",
    toArrayBuffer(decodeBytes(encodedKey)),
    algorithmName,
    false,
    keyUsages,
  );
}

export async function encryptApiKey(
  providerId: ProviderId,
  apiKey: string,
  key: CryptoKey,
  cryptoApi: Crypto = globalThis.crypto,
): Promise<EncryptedApiKeyRecord> {
  const iv = cryptoApi.getRandomValues(new Uint8Array(12));
  const encoded = toArrayBuffer(new TextEncoder().encode(apiKey));
  const encrypted = await cryptoApi.subtle.encrypt(
    { name: algorithmName, iv: toArrayBuffer(iv) },
    key,
    encoded,
  );
  const now = new Date().toISOString();

  return {
    id: providerId,
    providerId,
    ciphertext: encodeBytes(new Uint8Array(encrypted)),
    iv: encodeBytes(iv),
    createdAt: now,
    updatedAt: now,
  };
}

export async function decryptApiKey(
  record: EncryptedApiKeyRecord,
  key: CryptoKey,
  cryptoApi: Crypto = globalThis.crypto,
): Promise<string> {
  const parsedRecord = Schema.decodeUnknownSync(EncryptedApiKeyRecordSchema)(record);
  const decrypted = await cryptoApi.subtle.decrypt(
    { name: algorithmName, iv: toArrayBuffer(decodeBytes(parsedRecord.iv)) },
    key,
    toArrayBuffer(decodeBytes(parsedRecord.ciphertext)),
  );

  return new TextDecoder().decode(decrypted);
}

export async function saveEncryptedApiKey(
  storageArea: ApiKeyStorageArea,
  record: EncryptedApiKeyRecord,
): Promise<void> {
  const parsedRecord = Schema.decodeUnknownSync(EncryptedApiKeyRecordSchema)(record);
  await storageArea.set({
    [`${apiKeyStoragePrefix}.${parsedRecord.providerId}`]: parsedRecord,
  });
}

export async function readEncryptedApiKey(
  storageArea: ApiKeyStorageArea,
  providerId: ProviderId,
): Promise<EncryptedApiKeyRecord | undefined> {
  const key = `${apiKeyStoragePrefix}.${providerId}`;
  const record = (await storageArea.get(key))[key];
  if (record === undefined) {
    return undefined;
  }

  return Schema.decodeUnknownSync(EncryptedApiKeyRecordSchema)(record);
}

export async function removeEncryptedApiKey(
  storageArea: ApiKeyStorageArea,
  providerId: ProviderId,
): Promise<void> {
  await storageArea.remove(`${apiKeyStoragePrefix}.${providerId}`);
}

export async function readApiKeyEncryptionKey(
  storageArea: Pick<ApiKeyStorageArea, "get">,
): Promise<string | undefined> {
  const record = await storageArea.get(apiKeyEncryptionKeyStorageKey);
  const value = record[apiKeyEncryptionKeyStorageKey];
  return typeof value === "string" ? value : undefined;
}

export async function writeApiKeyEncryptionKey(
  storageArea: Pick<ApiKeyStorageArea, "set">,
  encodedKey: string,
): Promise<void> {
  await storageArea.set({ [apiKeyEncryptionKeyStorageKey]: encodedKey });
}
