import type { ConversationRecord } from "@askai/core";

export interface RetentionPolicy {
  historyEnabled: boolean;
  maxConversationCount?: number;
  maxStorageBytes?: number;
  maxAgeDays?: number;
  prunePinned?: boolean;
}

export interface RetentionPruningPlan {
  deleteConversationIds: string[];
  reasonsByConversationId: Record<string, "count" | "storage" | "age">;
}

export const defaultRetentionPolicy: Required<RetentionPolicy> = {
  historyEnabled: true,
  maxConversationCount: 250,
  maxStorageBytes: 100 * 1024 * 1024,
  maxAgeDays: 90,
  prunePinned: false,
};

export function createRetentionPruningPlan(
  conversations: ConversationRecord[],
  policy: RetentionPolicy = defaultRetentionPolicy,
  now = new Date(),
): RetentionPruningPlan {
  const effectivePolicy = { ...defaultRetentionPolicy, ...policy };
  const reasonsByConversationId: RetentionPruningPlan["reasonsByConversationId"] = {};
  const deleteConversationIds = new Set<string>();

  if (!effectivePolicy.historyEnabled) {
    for (const conversation of conversations) {
      deleteConversationIds.add(conversation.id);
      reasonsByConversationId[conversation.id] = "count";
    }
    return {
      deleteConversationIds: [...deleteConversationIds],
      reasonsByConversationId,
    };
  }

  const deletionCandidates = conversations
    .filter((conversation) => effectivePolicy.prunePinned || !conversation.pinned)
    .toSorted(
      (left, right) => new Date(left.updatedAt).getTime() - new Date(right.updatedAt).getTime(),
    );

  const maxAgeMs = effectivePolicy.maxAgeDays * 24 * 60 * 60 * 1000;
  for (const conversation of deletionCandidates) {
    if (now.getTime() - new Date(conversation.updatedAt).getTime() > maxAgeMs) {
      deleteConversationIds.add(conversation.id);
      reasonsByConversationId[conversation.id] = "age";
    }
  }

  const retainedByCount = conversations.filter(
    (conversation) => !deleteConversationIds.has(conversation.id),
  );
  const excessCount = retainedByCount.length - effectivePolicy.maxConversationCount;
  if (excessCount > 0) {
    for (const conversation of deletionCandidates) {
      if (deleteConversationIds.has(conversation.id)) {
        continue;
      }
      deleteConversationIds.add(conversation.id);
      reasonsByConversationId[conversation.id] = "count";
      if (
        conversations.length - deleteConversationIds.size <=
        effectivePolicy.maxConversationCount
      ) {
        break;
      }
    }
  }

  let retainedBytes = conversations
    .filter((conversation) => !deleteConversationIds.has(conversation.id))
    .reduce((total, conversation) => total + conversation.storageBytes, 0);

  for (const conversation of deletionCandidates) {
    if (retainedBytes <= effectivePolicy.maxStorageBytes) {
      break;
    }
    if (deleteConversationIds.has(conversation.id)) {
      continue;
    }
    deleteConversationIds.add(conversation.id);
    reasonsByConversationId[conversation.id] = "storage";
    retainedBytes -= conversation.storageBytes;
  }

  return {
    deleteConversationIds: [...deleteConversationIds],
    reasonsByConversationId,
  };
}
