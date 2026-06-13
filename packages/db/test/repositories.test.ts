import type {
  ChatMessageRecord,
  ContextMetrics,
  ContextSnapshot,
  ConversationRecord,
  TabSessionRecord,
} from "@askai/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AskAiDatabase,
  createContextRepository,
  createConversationRepository,
  createMessageRepository,
  createTabSessionRepository,
  initializeDatabase,
} from "../src";

let database: AskAiDatabase;
let databaseCounter = 0;

function iso(minutes = 0): string {
  return new Date(Date.UTC(2026, 5, 7, 12, minutes)).toISOString();
}

function conversationRecord(
  overrides: Partial<ConversationRecord> & Pick<ConversationRecord, "id">,
): ConversationRecord {
  return {
    id: overrides.id,
    title: overrides.title ?? `Conversation ${overrides.id}`,
    status: overrides.status ?? "active",
    pinned: overrides.pinned ?? false,
    providerId: overrides.providerId ?? "openai",
    modelId: overrides.modelId ?? "openai:gpt-4.1-mini",
    sourceUrl: overrides.sourceUrl,
    lastMessageAt: overrides.lastMessageAt,
    storageBytes: overrides.storageBytes ?? 100,
    createdAt: overrides.createdAt ?? iso(),
    updatedAt: overrides.updatedAt ?? iso(),
  };
}

function messageRecord(
  overrides: Partial<ChatMessageRecord> & Pick<ChatMessageRecord, "id" | "conversationId">,
): ChatMessageRecord {
  return {
    id: overrides.id,
    conversationId: overrides.conversationId,
    role: overrides.role ?? "user",
    content: overrides.content ?? "Hello",
    tokenEstimate: overrides.tokenEstimate ?? 2,
    storageBytes: overrides.storageBytes ?? 80,
    status: overrides.status ?? "complete",
    createdAt: overrides.createdAt ?? iso(),
    updatedAt: overrides.updatedAt ?? iso(),
    error: overrides.error,
    finishReason: overrides.finishReason,
  };
}

function tabSessionRecord(overrides: Partial<TabSessionRecord> & Pick<TabSessionRecord, "id">) {
  return {
    id: overrides.id,
    tabId: overrides.tabId ?? 12,
    windowId: overrides.windowId,
    url: overrides.url ?? "https://example.com",
    title: overrides.title ?? "Example",
    active: overrides.active ?? true,
    conversationId: overrides.conversationId,
    lastContextSnapshotId: overrides.lastContextSnapshotId,
    createdAt: overrides.createdAt ?? iso(),
    updatedAt: overrides.updatedAt ?? iso(),
  };
}

function contextSnapshotRecord(
  overrides: Partial<ContextSnapshot> & Pick<ContextSnapshot, "id" | "tabSessionId">,
): ContextSnapshot {
  return {
    id: overrides.id,
    tabSessionId: overrides.tabSessionId,
    conversationId: overrides.conversationId,
    url: overrides.url ?? "https://example.com",
    title: overrides.title ?? "Example",
    domain: overrides.domain ?? "example.com",
    mode: overrides.mode ?? "full-page",
    extractedAt: overrides.extractedAt ?? iso(),
    characterCount: overrides.characterCount ?? 12,
    tokenEstimate: overrides.tokenEstimate ?? 3,
    storageBytes: overrides.storageBytes ?? 120,
    contextHash: overrides.contextHash,
    createdAt: overrides.createdAt ?? iso(),
  };
}

function contextMetricsRecord(
  overrides: Partial<ContextMetrics> & Pick<ContextMetrics, "id" | "tabSessionId">,
): ContextMetrics {
  return {
    id: overrides.id,
    tabSessionId: overrides.tabSessionId,
    conversationId: overrides.conversationId,
    url: overrides.url ?? "https://example.com",
    extractedTokenCount: overrides.extractedTokenCount ?? 100,
    includedTokenCount: overrides.includedTokenCount ?? 80,
    cappedTokenCount: overrides.cappedTokenCount ?? 20,
    storageBytes: overrides.storageBytes ?? 64,
    createdAt: overrides.createdAt ?? iso(),
  };
}

beforeEach(async () => {
  databaseCounter += 1;
  database = new AskAiDatabase(`ask-ai-test-${databaseCounter}`);
  await initializeDatabase(database);
});

afterEach(async () => {
  await database.delete();
  database.close();
});

describe("conversation repository", () => {
  it("creates, lists, updates, and cascades deletes", async () => {
    const conversations = createConversationRepository(database);
    const messages = createMessageRepository(database);
    const context = createContextRepository(database);

    await conversations.create(conversationRecord({ id: "old", updatedAt: iso(1) }));
    await conversations.create(conversationRecord({ id: "archived", status: "archived" }));
    await conversations.create(conversationRecord({ id: "new", updatedAt: iso(2) }));
    await messages.create(messageRecord({ id: "message-1", conversationId: "new" }));
    await context.addSnapshot(
      contextSnapshotRecord({
        id: "snapshot-1",
        tabSessionId: "tab-1",
        conversationId: "new",
      }),
    );
    await context.addMetrics(
      contextMetricsRecord({
        id: "metrics-1",
        tabSessionId: "tab-1",
        conversationId: "new",
      }),
    );

    await expect(conversations.list()).resolves.toMatchObject([{ id: "new" }, { id: "old" }]);
    await expect(conversations.list({ includeArchived: true, limit: 2 })).resolves.toHaveLength(2);

    await expect(conversations.update("new", { title: "Updated" })).resolves.toBe(1);
    await expect(conversations.get("new")).resolves.toMatchObject({ title: "Updated" });

    await conversations.delete("new");

    await expect(conversations.get("new")).resolves.toBeUndefined();
    await expect(messages.listByConversation("new")).resolves.toEqual([]);
    await expect(context.listMetricsByConversation("new")).resolves.toEqual([]);
  });
});

describe("message repository", () => {
  it("appends messages in creation order and updates streaming assistant messages", async () => {
    const conversations = createConversationRepository(database);
    const messages = createMessageRepository(database);

    await conversations.create(conversationRecord({ id: "conversation-1" }));
    await messages.create(
      messageRecord({
        id: "assistant",
        conversationId: "conversation-1",
        role: "assistant",
        content: "",
        status: "streaming",
        createdAt: iso(2),
      }),
    );
    await messages.create(
      messageRecord({
        id: "user",
        conversationId: "conversation-1",
        role: "user",
        content: "Question",
        createdAt: iso(1),
      }),
    );

    await expect(messages.listByConversation("conversation-1")).resolves.toMatchObject([
      { id: "user" },
      { id: "assistant", status: "streaming" },
    ]);

    await expect(
      messages.update("assistant", {
        content: "Partial answer",
        status: "streaming",
        tokenEstimate: 4,
        storageBytes: 160,
      }),
    ).resolves.toBe(1);
    await expect(
      messages.update("assistant", {
        content: "Final answer",
        status: "complete",
        finishReason: "stop",
        tokenEstimate: 3,
        storageBytes: 150,
      }),
    ).resolves.toBe(1);
    await expect(messages.get("assistant")).resolves.toMatchObject({
      content: "Final answer",
      finishReason: "stop",
      status: "complete",
    });
  });
});

describe("tab session and context repositories", () => {
  it("restores tab sessions and stores context snapshots and metrics", async () => {
    const conversations = createConversationRepository(database);
    const tabs = createTabSessionRepository(database);
    const context = createContextRepository(database);

    await conversations.create(conversationRecord({ id: "conversation-1" }));
    await tabs.upsert(
      tabSessionRecord({
        id: "tab-session-1",
        tabId: 99,
        conversationId: "conversation-1",
      }),
    );
    await context.addSnapshot(
      contextSnapshotRecord({
        id: "snapshot-1",
        tabSessionId: "tab-session-1",
        conversationId: "conversation-1",
      }),
    );
    await context.addMetrics(
      contextMetricsRecord({
        id: "metrics-1",
        tabSessionId: "tab-session-1",
        conversationId: "conversation-1",
      }),
    );
    await tabs.update("tab-session-1", {
      lastContextSnapshotId: "snapshot-1",
      title: "Restored page",
    });

    await expect(tabs.getByTabId(99)).resolves.toMatchObject({
      id: "tab-session-1",
      conversationId: "conversation-1",
      lastContextSnapshotId: "snapshot-1",
      title: "Restored page",
    });
    await expect(context.latestSnapshotForTabSession("tab-session-1")).resolves.toMatchObject({
      id: "snapshot-1",
      title: "Example",
      domain: "example.com",
    });
    const snapshot = await context.latestSnapshotForTabSession("tab-session-1");
    expect(snapshot).not.toHaveProperty("text");
    await expect(context.listMetricsByConversation("conversation-1")).resolves.toMatchObject([
      {
        id: "metrics-1",
        extractedTokenCount: 100,
        includedTokenCount: 80,
        cappedTokenCount: 20,
      },
    ]);
  });
});
