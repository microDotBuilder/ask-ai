import {
  buildPageAwarePrompt,
  type ChatMessageRecord,
  type ConversationRecord,
  decryptApiKey,
  estimateTokens,
  type InternalModelId,
  importApiKeyEncryptionKey,
  type PageContext,
  type ProviderId,
  type ProviderStreamChunk,
  parseOpenAiCompatibleSseStream,
  readApiKeyEncryptionKey,
  readEncryptedApiKey,
  readSettings,
  resolveProviderRequestConfig,
  type TabSessionRecord,
  walkActivePath,
} from "@askai/core";
import {
  createContextRepository,
  createConversationRepository,
  createMessageRepository,
  createTabSessionRepository,
  estimateStorageBytes,
  initializeDatabase,
} from "@askai/db";
import { Effect } from "effect";

export type ChatServiceErrorCode =
  | "context-unavailable"
  | "missing-api-key"
  | "missing-encryption-key"
  | "provider-http-error"
  | "provider-stream-error"
  | "stream-unavailable"
  | "message-not-found";

export class ChatServiceError extends Error {
  constructor(
    message: string,
    public readonly code: ChatServiceErrorCode,
  ) {
    super(message);
    this.name = "ChatServiceError";
  }
}

export interface ProviderOverride {
  providerId: ProviderId;
  modelId: InternalModelId;
}

export interface StreamChatInput {
  question: string;
  pageContext: PageContext;
  tabId?: number;
  focus?: string;
  signal?: AbortSignal;
  onMessageUpdate?: (message: ChatMessageRecord) => void;
  onConversationReady?: (conversation: ConversationRecord) => void;
  providerOverride?: ProviderOverride;
}

export interface RestoredConversation {
  conversation?: ConversationRecord;
  messages: ChatMessageRecord[];
}

export interface StreamChatResult {
  conversation: ConversationRecord;
  userMessage: ChatMessageRecord;
  assistantMessage: ChatMessageRecord;
}

function nowIso(): string {
  return new Date().toISOString();
}

function newId(): string {
  return crypto.randomUUID();
}

function titleFromQuestion(question: string): string {
  const normalized = question.replace(/\s+/g, " ").trim();
  return normalized.length > 64 ? `${normalized.slice(0, 61)}...` : normalized || "New chat";
}

function createMessageRecord(
  record: Omit<
    ChatMessageRecord,
    "id" | "createdAt" | "updatedAt" | "tokenEstimate" | "storageBytes"
  >,
): ChatMessageRecord {
  const now = nowIso();
  const message: ChatMessageRecord = {
    ...record,
    id: newId(),
    createdAt: now,
    updatedAt: now,
    tokenEstimate: estimateTokens(record.content),
    storageBytes: 0,
  };

  return {
    ...message,
    storageBytes: estimateStorageBytes(message),
  };
}

async function getOrCreateTabSession(
  pageContext: PageContext,
  tabId?: number,
): Promise<TabSessionRecord> {
  const repository = createTabSessionRepository();
  const existing = tabId ? await repository.getByTabId(tabId) : undefined;
  const now = nowIso();
  const record: TabSessionRecord = {
    id: existing?.id ?? newId(),
    tabId: tabId ?? existing?.tabId ?? -1,
    windowId: existing?.windowId,
    url: pageContext.url,
    title: pageContext.title,
    active: true,
    conversationId: existing?.conversationId,
    lastContextSnapshotId: existing?.lastContextSnapshotId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await repository.upsert(record);
  return record;
}

async function createConversation(options: {
  title: string;
  sourceUrl?: string;
  providerId: ProviderId;
  modelId: InternalModelId;
}): Promise<ConversationRecord> {
  const now = nowIso();
  const conversation: ConversationRecord = {
    id: newId(),
    title: options.title,
    status: "active",
    pinned: false,
    providerId: options.providerId,
    modelId: options.modelId,
    sourceUrl: options.sourceUrl as ConversationRecord["sourceUrl"],
    lastMessageAt: now,
    storageBytes: 0,
    createdAt: now,
    updatedAt: now,
  };

  conversation.storageBytes = estimateStorageBytes(conversation);
  await createConversationRepository().create(conversation);
  return conversation;
}

async function getConversation(options: {
  question: string;
  pageContext: PageContext;
  tabSession: TabSessionRecord;
  providerId: ProviderId;
  modelId: InternalModelId;
}): Promise<ConversationRecord> {
  const repository = createConversationRepository();
  const existing = options.tabSession.conversationId
    ? await repository.get(options.tabSession.conversationId)
    : undefined;

  if (existing && existing.status === "active") {
    return existing;
  }

  const conversation = await createConversation({
    title: titleFromQuestion(options.question),
    sourceUrl: options.pageContext.url,
    providerId: options.providerId,
    modelId: options.modelId,
  });
  await createTabSessionRepository().update(options.tabSession.id, {
    conversationId: conversation.id,
    updatedAt: nowIso(),
  });
  return conversation;
}

async function resolveApiKey(providerId: ProviderId): Promise<string> {
  const encryptedRecord = await readEncryptedApiKey(chrome.storage.local, providerId);

  if (!encryptedRecord) {
    throw new ChatServiceError(
      `Add a ${providerId === "openai" ? "OpenAI" : "OpenRouter"} API key in settings before chatting.`,
      "missing-api-key",
    );
  }

  const encodedEncryptionKey = await readApiKeyEncryptionKey(chrome.storage.local);

  if (!encodedEncryptionKey) {
    throw new ChatServiceError("The saved API key cannot be decrypted.", "missing-encryption-key");
  }

  const encryptionKey = await importApiKeyEncryptionKey(encodedEncryptionKey);
  return decryptApiKey(encryptedRecord, encryptionKey);
}

async function persistContext(options: {
  tabSession: TabSessionRecord;
  conversation: ConversationRecord;
  pageContext: PageContext;
  includedTokenCount: number;
}): Promise<void> {
  const repository = createContextRepository();
  const snapshotId = newId();
  const extractedTokenCount = estimateTokens(options.pageContext.text);
  const extractedAt = nowIso();
  const snapshotMetadata = {
    url: options.pageContext.url,
    title: options.pageContext.title,
    domain: options.pageContext.domain,
    mode: options.pageContext.mode,
    extractedAt,
    characterCount: options.pageContext.metrics.characterCount,
    tokenEstimate: extractedTokenCount,
  };

  await repository.addSnapshot({
    id: snapshotId,
    tabSessionId: options.tabSession.id,
    conversationId: options.conversation.id,
    ...snapshotMetadata,
    storageBytes: estimateStorageBytes(snapshotMetadata),
    createdAt: extractedAt,
  });

  await repository.addMetrics({
    id: newId(),
    tabSessionId: options.tabSession.id,
    conversationId: options.conversation.id,
    url: options.pageContext.url,
    extractedTokenCount,
    includedTokenCount: options.includedTokenCount,
    cappedTokenCount: Math.max(0, extractedTokenCount - options.includedTokenCount),
    storageBytes: estimateStorageBytes(options.pageContext.metrics),
    createdAt: nowIso(),
  });

  await createTabSessionRepository().update(options.tabSession.id, {
    lastContextSnapshotId: snapshotId,
    updatedAt: nowIso(),
  });
}

async function flushAssistantMessage(
  message: ChatMessageRecord,
  content: string,
  status: ChatMessageRecord["status"],
  error?: ChatMessageRecord["error"],
  finishReason?: string,
): Promise<ChatMessageRecord> {
  const updated: ChatMessageRecord = {
    ...message,
    content,
    status,
    error,
    finishReason,
    tokenEstimate: estimateTokens(content),
    updatedAt: nowIso(),
  };
  updated.storageBytes = estimateStorageBytes(updated);

  await createMessageRepository().update(updated.id, {
    content: updated.content,
    status: updated.status,
    error: updated.error,
    finishReason: updated.finishReason,
    tokenEstimate: updated.tokenEstimate,
    storageBytes: updated.storageBytes,
    updatedAt: updated.updatedAt,
  });

  return updated;
}

function throwForProviderChunk(chunk: ProviderStreamChunk): never {
  if (chunk.type === "error") {
    throw new ChatServiceError(chunk.message, "provider-stream-error");
  }

  throw new ChatServiceError("Provider stream failed.", "provider-stream-error");
}

async function backfillLinearParentage(
  conversation: ConversationRecord,
  messages: ChatMessageRecord[],
): Promise<ChatMessageRecord[]> {
  if (messages.length === 0) {
    return messages;
  }
  if (messages.some((message) => message.parentMessageId)) {
    return messages;
  }

  const sorted = [...messages].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  const repository = createMessageRepository();
  const conversationRepository = createConversationRepository();
  const updated: ChatMessageRecord[] = [];

  for (const [i, current] of sorted.entries()) {
    const previous = i > 0 ? sorted[i - 1] : undefined;
    const next = i + 1 < sorted.length ? sorted[i + 1] : undefined;
    const changes: Partial<ChatMessageRecord> = {};
    if (previous) {
      changes.parentMessageId = previous.id;
    }
    if (next) {
      changes.activeChildId = next.id;
    }
    if (Object.keys(changes).length > 0) {
      await repository.update(current.id, changes);
      updated.push({ ...current, ...changes });
    } else {
      updated.push(current);
    }
  }

  const root = sorted[0];
  if (!conversation.activeChildId && root) {
    await conversationRepository.update(conversation.id, {
      activeChildId: root.id,
      updatedAt: nowIso(),
    });
  }

  return updated;
}

interface StreamingOptions {
  conversation: ConversationRecord;
  pageContext: PageContext;
  tabSession: TabSessionRecord;
  history: ChatMessageRecord[];
  question: string;
  focus?: string;
  contextTokenCap: number;
  parentForAssistantId: string;
  providerId: ProviderId;
  modelId: InternalModelId;
  apiKey: string;
  signal?: AbortSignal;
  onMessageUpdate?: (message: ChatMessageRecord) => void;
}

async function runStreaming(
  options: StreamingOptions,
): Promise<{ assistantMessage: ChatMessageRecord }> {
  const messageRepository = createMessageRepository();
  const providerConfig = resolveProviderRequestConfig({
    internalModelId: options.modelId,
    apiKey: options.apiKey,
    appTitle: "Ask AI",
    appUrl: chrome.runtime.getURL(""),
  });

  const prompt = buildPageAwarePrompt({
    question: options.question,
    pageContext: options.pageContext,
    history: options.history,
    focus: options.focus,
    contextTokenCap: options.contextTokenCap,
  });

  await persistContext({
    tabSession: options.tabSession,
    conversation: options.conversation,
    pageContext: options.pageContext,
    includedTokenCount: prompt.includedContextTokenEstimate,
  });

  const assistantMessage = createMessageRecord({
    conversationId: options.conversation.id,
    role: "assistant",
    content: "",
    status: "streaming",
    parentMessageId: options.parentForAssistantId,
    providerId: options.providerId,
    modelId: options.modelId,
  });

  await messageRepository.create(assistantMessage);
  await messageRepository.update(options.parentForAssistantId, {
    activeChildId: assistantMessage.id,
    updatedAt: nowIso(),
  });
  options.onMessageUpdate?.(assistantMessage);

  const requestBody = JSON.stringify({
    model: providerConfig.model,
    messages: prompt.messages,
    stream: true,
  });

  let assistantContent = "";
  let lastFlush = 0;
  let currentAssistant = assistantMessage;
  let finishReason: string | undefined;

  try {
    const response = await fetch(`${providerConfig.baseUrl}/chat/completions`, {
      method: "POST",
      headers: providerConfig.headers,
      body: requestBody,
      signal: options.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new ChatServiceError(
        body || `Provider returned HTTP ${response.status}.`,
        "provider-http-error",
      );
    }

    if (!response.body) {
      throw new ChatServiceError(
        "Provider did not return a readable stream.",
        "stream-unavailable",
      );
    }

    for await (const chunk of parseOpenAiCompatibleSseStream(response.body)) {
      if (chunk.type === "error") {
        throwForProviderChunk(chunk);
      }

      if (chunk.type === "finish") {
        finishReason = chunk.finishReason;
        continue;
      }

      assistantContent += chunk.content;
      const now = Date.now();

      if (
        now - lastFlush >= 500 ||
        assistantContent.length - currentAssistant.content.length >= 256
      ) {
        currentAssistant = await flushAssistantMessage(
          currentAssistant,
          assistantContent,
          "streaming",
        );
        options.onMessageUpdate?.(currentAssistant);
        lastFlush = now;
      }
    }

    currentAssistant = await flushAssistantMessage(
      currentAssistant,
      assistantContent,
      "complete",
      undefined,
      finishReason,
    );
    options.onMessageUpdate?.(currentAssistant);
    await createConversationRepository().update(options.conversation.id, {
      lastMessageAt: nowIso(),
      updatedAt: nowIso(),
    });

    return { assistantMessage: currentAssistant };
  } catch (error) {
    const aborted = options.signal?.aborted;
    const message =
      error instanceof Error
        ? error.message
        : aborted
          ? "Response generation was stopped."
          : "Chat request failed.";
    currentAssistant = await flushAssistantMessage(
      currentAssistant,
      assistantContent,
      aborted ? "cancelled" : "failed",
      aborted ? undefined : { message },
    );
    options.onMessageUpdate?.(currentAssistant);

    if (aborted) {
      return { assistantMessage: currentAssistant };
    }

    throw error;
  }
}

export async function restoreActiveConversation(tabId?: number): Promise<RestoredConversation> {
  await initializeDatabase();

  const tabSession = tabId ? await createTabSessionRepository().getByTabId(tabId) : undefined;
  const conversation = tabSession?.conversationId
    ? await createConversationRepository().get(tabSession.conversationId)
    : undefined;
  const messages = conversation
    ? await createMessageRepository().listByConversation(conversation.id)
    : [];

  return { conversation, messages };
}

export async function restoreConversationById(
  tabId: number,
  conversationId: string,
): Promise<RestoredConversation> {
  await initializeDatabase();

  const conversation = await createConversationRepository().get(conversationId);
  if (!conversation) {
    throw new ChatServiceError("Conversation not found.", "message-not-found");
  }

  const sessionRepository = createTabSessionRepository();
  const existing = await sessionRepository.getByTabId(tabId);
  const now = nowIso();

  if (existing) {
    await sessionRepository.update(existing.id, {
      conversationId,
      updatedAt: now,
    });
  } else {
    const tab = await chrome.tabs.get(tabId).catch(() => undefined);
    const url = (tab?.url ?? conversation.sourceUrl ?? "about:blank") as TabSessionRecord["url"];
    await sessionRepository.upsert({
      id: newId(),
      tabId,
      windowId: tab?.windowId,
      url,
      title: tab?.title ?? conversation.title,
      active: true,
      conversationId,
      createdAt: now,
      updatedAt: now,
    });
  }

  const messages = await createMessageRepository().listByConversation(conversation.id);
  return { conversation, messages };
}

export async function startNewConversation(tabId?: number): Promise<void> {
  if (!tabId) {
    return;
  }

  await initializeDatabase();

  const tabSession = await createTabSessionRepository().getByTabId(tabId);
  if (!tabSession) {
    return;
  }

  await createTabSessionRepository().update(tabSession.id, {
    conversationId: undefined,
    updatedAt: nowIso(),
  });
}

async function streamChatImplementation(input: StreamChatInput): Promise<StreamChatResult> {
  if (!input.pageContext.text.trim()) {
    throw new ChatServiceError("Page context is empty for this tab.", "context-unavailable");
  }

  await initializeDatabase();

  const settings = await readSettings(chrome.storage.local);
  const providerId = input.providerOverride?.providerId ?? settings.defaultProviderId;
  const modelId = input.providerOverride?.modelId ?? settings.defaultModelId;
  const apiKey = await resolveApiKey(providerId);
  const tabSession = await getOrCreateTabSession(input.pageContext, input.tabId);
  let conversation = await getConversation({
    question: input.question,
    pageContext: input.pageContext,
    tabSession,
    providerId,
    modelId,
  });
  input.onConversationReady?.(conversation);

  const messageRepository = createMessageRepository();
  const allMessages = await messageRepository.listByConversation(conversation.id);
  const backfilled = await backfillLinearParentage(conversation, allMessages);
  if (backfilled !== allMessages && !conversation.activeChildId) {
    conversation = { ...conversation, activeChildId: backfilled[0]?.id };
  }

  const { path: activePath } = walkActivePath(conversation, backfilled);
  const activeLeaf = activePath[activePath.length - 1];
  const userMessage = createMessageRecord({
    conversationId: conversation.id,
    role: "user",
    content: input.question,
    status: "complete",
    parentMessageId: activeLeaf?.id,
  });

  await messageRepository.create(userMessage);
  if (activeLeaf) {
    await messageRepository.update(activeLeaf.id, {
      activeChildId: userMessage.id,
      updatedAt: nowIso(),
    });
  } else {
    await createConversationRepository().update(conversation.id, {
      activeChildId: userMessage.id,
      updatedAt: nowIso(),
    });
    conversation = { ...conversation, activeChildId: userMessage.id };
  }
  input.onMessageUpdate?.(userMessage);

  const { assistantMessage } = await runStreaming({
    conversation,
    pageContext: input.pageContext,
    tabSession,
    history: activePath,
    question: input.question,
    focus: input.focus,
    contextTokenCap: settings.contextTokenCap,
    parentForAssistantId: userMessage.id,
    providerId,
    modelId,
    apiKey,
    signal: input.signal,
    onMessageUpdate: input.onMessageUpdate,
  });

  return {
    conversation,
    userMessage,
    assistantMessage,
  };
}

async function loadConversationForTab(tabId?: number): Promise<{
  conversation: ConversationRecord;
  tabSession: TabSessionRecord;
  messages: ChatMessageRecord[];
}> {
  await initializeDatabase();
  if (!tabId) {
    throw new ChatServiceError("Active tab is unavailable.", "context-unavailable");
  }
  const tabSession = await createTabSessionRepository().getByTabId(tabId);
  if (!tabSession?.conversationId) {
    throw new ChatServiceError("No active conversation for this tab.", "message-not-found");
  }
  const conversation = await createConversationRepository().get(tabSession.conversationId);
  if (!conversation) {
    throw new ChatServiceError("Active conversation was not found.", "message-not-found");
  }
  const messages = await createMessageRepository().listByConversation(conversation.id);
  return { conversation, tabSession, messages };
}

async function switchActivePathTo(
  conversation: ConversationRecord,
  messages: ChatMessageRecord[],
  target: ChatMessageRecord,
): Promise<{ conversation: ConversationRecord; path: ChatMessageRecord[] }> {
  const byId = new Map(messages.map((message) => [message.id, message] as const));
  const chain: ChatMessageRecord[] = [];
  let cursor: ChatMessageRecord | undefined = target;
  while (cursor) {
    chain.unshift(cursor);
    cursor = cursor.parentMessageId ? byId.get(cursor.parentMessageId) : undefined;
  }

  const messageRepository = createMessageRepository();
  for (const [i, parent] of chain.entries()) {
    const child = chain[i + 1];
    if (!child) {
      break;
    }
    if (parent.activeChildId !== child.id) {
      await messageRepository.update(parent.id, {
        activeChildId: child.id,
        updatedAt: nowIso(),
      });
    }
  }

  let nextConversation = conversation;
  const rootId = chain[0]?.id;
  if (rootId && conversation.activeChildId !== rootId) {
    await createConversationRepository().update(conversation.id, {
      activeChildId: rootId,
      updatedAt: nowIso(),
    });
    nextConversation = { ...conversation, activeChildId: rootId };
  }

  return { conversation: nextConversation, path: chain };
}

export async function setActiveSibling(
  tabId: number | undefined,
  targetMessageId: string,
): Promise<RestoredConversation> {
  const { conversation, messages } = await loadConversationForTab(tabId);
  const target = messages.find((message) => message.id === targetMessageId);
  if (!target) {
    throw new ChatServiceError("Sibling message not found.", "message-not-found");
  }
  const { conversation: nextConversation } = await switchActivePathTo(
    conversation,
    messages,
    target,
  );
  const refreshed = await createMessageRepository().listByConversation(nextConversation.id);
  return { conversation: nextConversation, messages: refreshed };
}

export function streamChatEffect(
  input: StreamChatInput,
): Effect.Effect<StreamChatResult, ChatServiceError> {
  return Effect.tryPromise({
    try: () => streamChatImplementation(input),
    catch: (error) =>
      error instanceof ChatServiceError
        ? error
        : new ChatServiceError(
            error instanceof Error ? error.message : "Chat request failed.",
            "provider-stream-error",
          ),
  });
}

export async function streamChat(input: StreamChatInput): Promise<StreamChatResult> {
  const result = await Effect.runPromise(Effect.either(streamChatEffect(input)));

  if (result._tag === "Left") {
    throw result.left;
  }

  return result.right;
}
