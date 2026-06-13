import type { ConversationRecord } from "@askai/core";
import { describe, expect, it, vi } from "vitest";
import {
  createRetentionPruningPlan,
  createUsageSummary,
  estimateBrowserStorage,
  estimateStorageBytes,
  isPersistentStorageGranted,
  requestPersistentStorage,
  summarizeStorage,
} from "../src";

function conversation(
  id: string,
  updatedAt: string,
  overrides: Partial<ConversationRecord> = {},
): ConversationRecord {
  return {
    id,
    title: id,
    status: "active",
    pinned: false,
    providerId: "openai",
    modelId: "openai:gpt-4.1-mini",
    storageBytes: 100,
    createdAt: updatedAt,
    updatedAt,
    ...overrides,
  };
}

describe("retention pruning", () => {
  it("deletes every conversation when history is disabled", () => {
    const plan = createRetentionPruningPlan(
      [
        conversation("first", "2026-06-01T00:00:00.000Z"),
        conversation("second", "2026-06-02T00:00:00.000Z"),
      ],
      { historyEnabled: false },
    );

    expect(plan.deleteConversationIds).toEqual(["first", "second"]);
    expect(plan.reasonsByConversationId).toEqual({
      first: "count",
      second: "count",
    });
  });

  it("prunes by age, count, and storage while preserving pinned conversations by default", () => {
    const now = new Date("2026-06-07T00:00:00.000Z");
    const plan = createRetentionPruningPlan(
      [
        conversation("pinned-old", "2026-01-01T00:00:00.000Z", {
          pinned: true,
          storageBytes: 1_000,
        }),
        conversation("too-old", "2026-01-02T00:00:00.000Z", { storageBytes: 10 }),
        conversation("oldest", "2026-06-01T00:00:00.000Z", { storageBytes: 400 }),
        conversation("middle", "2026-06-02T00:00:00.000Z", { storageBytes: 400 }),
        conversation("newest", "2026-06-03T00:00:00.000Z", { storageBytes: 400 }),
      ],
      {
        historyEnabled: true,
        maxAgeDays: 30,
        maxConversationCount: 3,
        maxStorageBytes: 1_400,
      },
      now,
    );

    expect(plan.deleteConversationIds).toEqual(["too-old", "oldest", "middle"]);
    expect(plan.reasonsByConversationId).toEqual({
      "too-old": "age",
      oldest: "count",
      middle: "storage",
    });
  });

  it("can include pinned conversations when pruning is configured to do so", () => {
    const plan = createRetentionPruningPlan(
      [
        conversation("pinned", "2026-01-01T00:00:00.000Z", { pinned: true }),
        conversation("new", "2026-06-01T00:00:00.000Z"),
      ],
      {
        historyEnabled: true,
        maxAgeDays: 30,
        prunePinned: true,
      },
      new Date("2026-06-07T00:00:00.000Z"),
    );

    expect(plan.deleteConversationIds).toEqual(["pinned"]);
    expect(plan.reasonsByConversationId.pinned).toBe("age");
  });
});

describe("storage usage helpers", () => {
  it("estimates encoded JSON storage bytes and aggregates records", () => {
    const records = [{ id: "one", text: "hello" }, { id: "two" }];
    const summary = summarizeStorage(records);

    expect(summary).toEqual({
      bytesUsed: records.reduce((total, record) => total + estimateStorageBytes(record), 0),
      recordCount: 2,
    });
  });

  it("wraps browser storage manager capabilities", async () => {
    const storageManager = {
      estimate: vi.fn(async () => ({ quota: 1_000, usage: 250 })),
      persist: vi.fn(async () => true),
      persisted: vi.fn(async () => true),
    } as unknown as StorageManager;

    await expect(estimateBrowserStorage(storageManager)).resolves.toEqual({
      quota: 1_000,
      usage: 250,
    });
    await expect(isPersistentStorageGranted(storageManager)).resolves.toBe(true);
    await expect(requestPersistentStorage(storageManager)).resolves.toBe(true);
  });

  it("creates usage summaries with browser estimates when available", async () => {
    const storageManager = {
      estimate: vi.fn(async () => ({ quota: 2_000, usage: 600 })),
      persisted: vi.fn(async () => false),
    } as unknown as StorageManager;

    await expect(
      createUsageSummary([{ id: "conversation" }], [{ id: "message" }], storageManager),
    ).resolves.toMatchObject({
      conversations: { recordCount: 1 },
      messages: { recordCount: 1 },
      total: { recordCount: 2 },
      browserEstimate: { quota: 2_000, usage: 600 },
      persisted: false,
    });
  });
});
