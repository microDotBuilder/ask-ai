import type {
  ChatMessageRecord,
  ContextMetrics,
  ContextSnapshot,
  ConversationRecord,
  TabSessionRecord,
} from "@askai/core";
import Dexie, { type EntityTable } from "dexie";

export const databaseName = "ask-ai";

export const schemaVersion = 2;

export interface SecretRecord {
  id: string;
  key: CryptoKey;
  createdAt: string;
  updatedAt: string;
}

export class AskAiDatabase extends Dexie {
  conversations!: EntityTable<ConversationRecord, "id">;
  messages!: EntityTable<ChatMessageRecord, "id">;
  tabSessions!: EntityTable<TabSessionRecord, "id">;
  contextSnapshots!: EntityTable<ContextSnapshot, "id">;
  contextMetrics!: EntityTable<ContextMetrics, "id">;
  secrets!: EntityTable<SecretRecord, "id">;

  constructor(name = databaseName) {
    super(name);

    this.version(1).stores({
      conversations: "id, updatedAt, createdAt, lastMessageAt, status, pinned, sourceUrl",
      messages: "id, conversationId, createdAt, updatedAt, role",
      tabSessions: "id, tabId, windowId, url, active, conversationId, updatedAt",
      contextSnapshots: "id, tabSessionId, conversationId, url, createdAt",
      contextMetrics: "id, tabSessionId, conversationId, url, createdAt",
    });

    this.version(2).stores({
      // Holds non-extractable CryptoKey objects for envelope-encrypting saved
      // API keys. Stored in IndexedDB so the raw bytes never reach JS or
      // `chrome.storage.local`.
      secrets: "id, updatedAt",
    });
  }
}

export const db = new AskAiDatabase();

export type AskAiTableName =
  | "conversations"
  | "messages"
  | "tabSessions"
  | "contextSnapshots"
  | "contextMetrics"
  | "secrets";

export async function initializeDatabase(database = db): Promise<AskAiDatabase> {
  await database.open();
  return database;
}
