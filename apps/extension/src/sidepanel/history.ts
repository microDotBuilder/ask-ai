import type { ConversationRecord } from "@askai/core";
import {
  createConversationRepository,
  createMessageRepository,
  initializeDatabase,
} from "@askai/db";

export interface HistoryEntry {
  id: string;
  title: string;
  domain: string;
  firstUserMessage: string;
  sourceUrl?: string;
  lastMessageAt: string;
  isCurrentDomain: boolean;
}

const MAX_ENTRIES = 100;

function extractDomain(sourceUrl: string | undefined): string {
  if (!sourceUrl) {
    return "";
  }
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function timestampFor(conversation: ConversationRecord): string {
  return conversation.lastMessageAt ?? conversation.updatedAt ?? conversation.createdAt;
}

export async function loadHistoryEntries(
  currentDomain: string | undefined,
): Promise<HistoryEntry[]> {
  await initializeDatabase();

  const conversations = await createConversationRepository().list({ limit: MAX_ENTRIES });
  const messageRepository = createMessageRepository();
  const normalizedCurrent = currentDomain ? currentDomain.replace(/^www\./, "") : undefined;

  const entries = await Promise.all(
    conversations.map(async (conversation) => {
      const domain = extractDomain(conversation.sourceUrl);
      const messages = await messageRepository.listByConversation(conversation.id);
      const firstUser = messages.find((message) => message.role === "user");

      return {
        id: conversation.id,
        title: conversation.title,
        domain,
        firstUserMessage: firstUser?.content ?? "",
        sourceUrl: conversation.sourceUrl,
        lastMessageAt: timestampFor(conversation),
        isCurrentDomain: Boolean(normalizedCurrent) && domain === normalizedCurrent,
      } satisfies HistoryEntry;
    }),
  );

  entries.sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1));
  return entries;
}
