import type {
  ChatMessageRecord,
  ContextMetrics,
  ContextSnapshot,
  ConversationRecord,
  CryptoKeyStore,
  TabSessionRecord,
} from "@askai/core";
import {
  parseChatMessageRecord,
  parseContextMetrics,
  parseContextSnapshot,
  parseConversationRecord,
  parseTabSessionRecord,
} from "@askai/core";
import type { AskAiDatabase } from "../schema";
import { db } from "../schema";

export interface RepositoryRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface ListConversationsOptions {
  limit?: number;
  includeArchived?: boolean;
}

export function createConversationRepository(database: AskAiDatabase = db) {
  return {
    async create(record: ConversationRecord): Promise<string> {
      return database.conversations.add(parseConversationRecord(record));
    },
    async get(id: string): Promise<ConversationRecord | undefined> {
      const record = await database.conversations.get(id);
      return record ? parseConversationRecord(record) : undefined;
    },
    async list(options: ListConversationsOptions = {}): Promise<ConversationRecord[]> {
      const collection = database.conversations
        .orderBy("updatedAt")
        .reverse()
        .filter((conversation) => options.includeArchived || conversation.status !== "archived");
      const records =
        options.limit === undefined
          ? await collection.toArray()
          : await collection.limit(options.limit).toArray();
      return records.map(parseConversationRecord);
    },
    async update(
      id: string,
      changes: Partial<Omit<ConversationRecord, "id" | "createdAt">>,
    ): Promise<number> {
      return database.conversations.update(id, changes);
    },
    async delete(id: string): Promise<void> {
      await database.transaction(
        "rw",
        database.conversations,
        database.messages,
        database.contextSnapshots,
        database.contextMetrics,
        async () => {
          await database.messages.where({ conversationId: id }).delete();
          await database.contextSnapshots.where({ conversationId: id }).delete();
          await database.contextMetrics.where({ conversationId: id }).delete();
          await database.conversations.delete(id);
        },
      );
    },
  };
}

export function createMessageRepository(database: AskAiDatabase = db) {
  return {
    async create(record: ChatMessageRecord): Promise<string> {
      return database.messages.add(parseChatMessageRecord(record));
    },
    async get(id: string): Promise<ChatMessageRecord | undefined> {
      const record = await database.messages.get(id);
      return record ? parseChatMessageRecord(record) : undefined;
    },
    async listByConversation(conversationId: string): Promise<ChatMessageRecord[]> {
      return (await database.messages.where({ conversationId }).sortBy("createdAt")).map(
        parseChatMessageRecord,
      );
    },
    async update(
      id: string,
      changes: Partial<Omit<ChatMessageRecord, "id" | "createdAt">>,
    ): Promise<number> {
      return database.messages.update(id, changes);
    },
    async delete(id: string): Promise<void> {
      await database.messages.delete(id);
    },
  };
}

export function createTabSessionRepository(database: AskAiDatabase = db) {
  return {
    async upsert(record: TabSessionRecord): Promise<string> {
      const parsedRecord = parseTabSessionRecord(record);
      await database.tabSessions.put(parsedRecord);
      return parsedRecord.id;
    },
    async get(id: string): Promise<TabSessionRecord | undefined> {
      const record = await database.tabSessions.get(id);
      return record ? parseTabSessionRecord(record) : undefined;
    },
    async getByTabId(tabId: number): Promise<TabSessionRecord | undefined> {
      const record = await database.tabSessions.where({ tabId }).last();
      return record ? parseTabSessionRecord(record) : undefined;
    },
    async update(
      id: string,
      changes: Partial<Omit<TabSessionRecord, "id" | "createdAt">>,
    ): Promise<number> {
      return database.tabSessions.update(id, changes);
    },
    async delete(id: string): Promise<void> {
      await database.tabSessions.delete(id);
    },
  };
}

export function createCryptoKeyStore(database: AskAiDatabase = db): CryptoKeyStore {
  return {
    async get(id) {
      const record = await database.secrets.get(id);
      return record?.key;
    },
    async put(id, key) {
      const now = new Date().toISOString();
      const existing = await database.secrets.get(id);
      await database.secrets.put({
        id,
        key,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
    },
    async delete(id) {
      await database.secrets.delete(id);
    },
  };
}

export function createContextRepository(database: AskAiDatabase = db) {
  return {
    async addSnapshot(record: ContextSnapshot): Promise<string> {
      return database.contextSnapshots.add(parseContextSnapshot(record));
    },
    async addMetrics(record: ContextMetrics): Promise<string> {
      return database.contextMetrics.add(parseContextMetrics(record));
    },
    async listMetricsByConversation(conversationId: string): Promise<ContextMetrics[]> {
      return (await database.contextMetrics.where({ conversationId }).sortBy("createdAt")).map(
        parseContextMetrics,
      );
    },
    async latestSnapshotForTabSession(tabSessionId: string): Promise<ContextSnapshot | undefined> {
      const record = await database.contextSnapshots.where({ tabSessionId }).last();
      return record ? parseContextSnapshot(record) : undefined;
    },
    async deleteByConversation(conversationId: string): Promise<void> {
      await database.transaction(
        "rw",
        database.contextSnapshots,
        database.contextMetrics,
        async () => {
          await database.contextSnapshots.where({ conversationId }).delete();
          await database.contextMetrics.where({ conversationId }).delete();
        },
      );
    },
  };
}
