export interface StorageUsage {
  bytesUsed: number;
  recordCount: number;
}

export interface StorageEstimate {
  quota?: number;
  usage?: number;
  usageDetails?: Record<string, number>;
}

export interface UsageSummary {
  conversations: StorageUsage;
  messages: StorageUsage;
  total: StorageUsage;
  browserEstimate?: StorageEstimate;
  persisted?: boolean;
}

export function estimateStorageBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function summarizeStorage(records: unknown[]): StorageUsage {
  return {
    bytesUsed: records.reduce<number>((total, record) => total + estimateStorageBytes(record), 0),
    recordCount: records.length,
  };
}

function defaultStorageManager(): StorageManager | undefined {
  return globalThis.navigator?.storage;
}

export async function estimateBrowserStorage(
  storageManager: StorageManager | undefined = defaultStorageManager(),
): Promise<StorageEstimate | undefined> {
  if (storageManager?.estimate === undefined) {
    return undefined;
  }

  return storageManager.estimate();
}

export async function isPersistentStorageGranted(
  storageManager: StorageManager | undefined = defaultStorageManager(),
): Promise<boolean> {
  if (storageManager?.persisted === undefined) {
    return false;
  }

  return storageManager.persisted();
}

export async function requestPersistentStorage(
  storageManager: StorageManager | undefined = defaultStorageManager(),
): Promise<boolean> {
  if (storageManager?.persist === undefined) {
    return false;
  }

  return storageManager.persist();
}

export async function createUsageSummary(
  conversations: unknown[],
  messages: unknown[],
  storageManager: StorageManager | undefined = defaultStorageManager(),
): Promise<UsageSummary> {
  const conversationUsage = summarizeStorage(conversations);
  const messageUsage = summarizeStorage(messages);

  return {
    conversations: conversationUsage,
    messages: messageUsage,
    total: {
      bytesUsed: conversationUsage.bytesUsed + messageUsage.bytesUsed,
      recordCount: conversationUsage.recordCount + messageUsage.recordCount,
    },
    browserEstimate: await estimateBrowserStorage(storageManager),
    persisted: await isPersistentStorageGranted(storageManager),
  };
}
