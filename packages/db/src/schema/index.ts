import type {
  ChatMessageRecord,
  ContextMetrics,
  ContextSnapshot,
  ConversationRecord,
  TabSessionRecord,
} from "@askai/core";
import Dexie, { type EntityTable } from "dexie";

export const databaseName = "ask-ai";

export const schemaVersion = 1;

export class AskAiDatabase extends Dexie {
  conversations!: EntityTable<ConversationRecord, "id">;
  messages!: EntityTable<ChatMessageRecord, "id">;
  tabSessions!: EntityTable<TabSessionRecord, "id">;
  contextSnapshots!: EntityTable<ContextSnapshot, "id">;
  contextMetrics!: EntityTable<ContextMetrics, "id">;

  constructor(name = databaseName) {
    super(name);

    this.version(schemaVersion).stores({
      conversations: "id, updatedAt, createdAt, lastMessageAt, status, pinned, sourceUrl",
      messages: "id, conversationId, createdAt, updatedAt, role",
      tabSessions: "id, tabId, windowId, url, active, conversationId, updatedAt",
      contextSnapshots: "id, tabSessionId, conversationId, url, createdAt",
      contextMetrics: "id, tabSessionId, conversationId, url, createdAt",
    });
  }
}

export const db = new AskAiDatabase();

export type AskAiTableName =
  | "conversations"
  | "messages"
  | "tabSessions"
  | "contextSnapshots"
  | "contextMetrics";

export async function initializeDatabase(database = db): Promise<AskAiDatabase> {
  await database.open();
  return database;
}
