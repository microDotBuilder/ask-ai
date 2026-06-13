import * as Schema from "effect/Schema";
import type { ProviderId } from "../types";

const algorithmName = "AES-GCM";
const keyUsages: KeyUsage[] = ["encrypt", "decrypt"];

export const EncryptedApiKeyRecordSchema = Schema.Struct({
  id: Schema.String,
  providerId: Schema.Literal("openai", "openrouter"),
  ciphertext: Schema.String,
  iv: Schema.String,
  createdAt: Schema.String,
  updatedAt: Schema.String,
});

export interface EncryptedSecretRecord {
  id: string;
  provider: string;
  ciphertext: string;
  createdAt: string;
}

export type EncryptedApiKeyRecord = Schema.Schema.Type<typeof EncryptedApiKeyRecordSchema>;

export interface ApiKeyStorageArea {
  get(keys?: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

export const apiKeyStoragePrefix = "askai.apiKey";
export const apiKeyEncryptionKeyStorageKey = "askai.apiKey.encryptionKey";

export function encodeBytes(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

export function decodeBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function generateApiKeyEncryptionKey(
  cryptoApi: Crypto = globalThis.crypto,
): Promise<CryptoKey> {
  return cryptoApi.subtle.generateKey({ name: algorithmName, length: 256 }, true, keyUsages);
}

export async function exportApiKeyEncryptionKey(
  key: CryptoKey,
  cryptoApi: Crypto = globalThis.crypto,
): Promise<string> {
  const rawKey = await cryptoApi.subtle.exportKey("raw", key);
  return encodeBytes(new Uint8Array(rawKey));
}

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
