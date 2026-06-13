import type { ChatMessageRecord, ConversationRecord } from "./index";

export interface SiblingInfo {
  index: number;
  total: number;
  siblingIds: string[];
}

export interface ActivePathResult {
  path: ChatMessageRecord[];
  siblings: Map<string, SiblingInfo>;
}

function pickActiveChild(
  candidates: ChatMessageRecord[],
  preferredId: string | undefined,
): ChatMessageRecord | undefined {
  if (!candidates.length) {
    return undefined;
  }

  if (preferredId) {
    const preferred = candidates.find((candidate) => candidate.id === preferredId);
    if (preferred) {
      return preferred;
    }
  }

  return candidates.reduce((newest, current) =>
    current.createdAt > newest.createdAt ? current : newest,
  );
}

function describeSiblings(group: ChatMessageRecord[], active: ChatMessageRecord): SiblingInfo {
  const sorted = [...group].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  const ids = sorted.map((message) => message.id);
  return {
    index: ids.indexOf(active.id),
    total: ids.length,
    siblingIds: ids,
  };
}

export function walkActivePath(
  conversation: Pick<ConversationRecord, "activeChildId"> | undefined,
  messages: readonly ChatMessageRecord[],
): ActivePathResult {
  const path: ChatMessageRecord[] = [];
  const siblings = new Map<string, SiblingInfo>();

  if (!messages.length) {
    return { path, siblings };
  }

  const byParent = new Map<string | undefined, ChatMessageRecord[]>();
  const hasParentPointers = messages.some((message) => message.parentMessageId);

  if (!hasParentPointers) {
    const linear = [...messages].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    return { path: linear, siblings };
  }

  for (const message of messages) {
    const key = message.parentMessageId;
    const bucket = byParent.get(key) ?? [];
    bucket.push(message);
    byParent.set(key, bucket);
  }

  const byId = new Map(messages.map((message) => [message.id, message] as const));
  const roots = byParent.get(undefined) ?? [];
  let current = pickActiveChild(roots, conversation?.activeChildId);
  const visited = new Set<string>();
  const maxSteps = messages.length + 1;

  while (current && path.length < maxSteps) {
    if (visited.has(current.id)) {
      break;
    }
    visited.add(current.id);
    path.push(current);
    const siblingGroup = byParent.get(current.parentMessageId) ?? [current];
    if (siblingGroup.length > 1) {
      siblings.set(current.id, describeSiblings(siblingGroup, current));
    }

    const children = byParent.get(current.id) ?? [];
    const next = pickActiveChild(children, current.activeChildId);
    if (!next || !byId.has(next.id)) {
      break;
    }
    current = next;
  }

  return { path, siblings };
}
