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
  | "stream-unavailable";

export class ChatServiceError extends Error {
  constructor(
    message: string,
    public readonly code: ChatServiceErrorCode,
  ) {
    super(message);
    this.name = "ChatServiceError";
  }
}

export interface StreamChatInput {
  question: string;
  pageContext: PageContext;
  tabId?: number;
  focus?: string;
  signal?: AbortSignal;
  onMessageUpdate?: (message: ChatMessageRecord) => void;
  onConversationReady?: (conversation: ConversationRecord) => void;
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
  question: string;
  pageContext: PageContext;
  providerId: ProviderId;
  modelId: InternalModelId;
}): Promise<ConversationRecord> {
  const now = nowIso();
  const conversation: ConversationRecord = {
    id: newId(),
    title: titleFromQuestion(options.question),
    status: "active",
    pinned: false,
    providerId: options.providerId,
    modelId: options.modelId,
    sourceUrl: options.pageContext.url,
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

  const conversation = await createConversation(options);
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
  const providerId = settings.defaultProviderId;
  const modelId = settings.defaultModelId;
  const apiKey = await resolveApiKey(providerId);
  const providerConfig = resolveProviderRequestConfig({
    internalModelId: modelId,
    apiKey,
    appTitle: "Ask AI",
    appUrl: chrome.runtime.getURL(""),
  });
  const tabSession = await getOrCreateTabSession(input.pageContext, input.tabId);
  const conversation = await getConversation({
    question: input.question,
    pageContext: input.pageContext,
    tabSession,
    providerId,
    modelId,
  });
  input.onConversationReady?.(conversation);

  const messageRepository = createMessageRepository();
  const history = await messageRepository.listByConversation(conversation.id);
  const prompt = buildPageAwarePrompt({
    question: input.question,
    pageContext: input.pageContext,
    history,
    focus: input.focus,
    contextTokenCap: settings.contextTokenCap,
  });

  await persistContext({
    tabSession,
    conversation,
    pageContext: input.pageContext,
    includedTokenCount: prompt.includedContextTokenEstimate,
  });

  const userMessage = createMessageRecord({
    conversationId: conversation.id,
    role: "user",
    content: input.question,
    status: "complete",
  });
  const assistantMessage = createMessageRecord({
    conversationId: conversation.id,
    role: "assistant",
    content: "",
    status: "streaming",
  });

  await messageRepository.create(userMessage);
  await messageRepository.create(assistantMessage);
  input.onMessageUpdate?.(userMessage);
  input.onMessageUpdate?.(assistantMessage);

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
      signal: input.signal,
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
        input.onMessageUpdate?.(currentAssistant);
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
    input.onMessageUpdate?.(currentAssistant);
    await createConversationRepository().update(conversation.id, {
      lastMessageAt: nowIso(),
      updatedAt: nowIso(),
    });

    return {
      conversation,
      userMessage,
      assistantMessage: currentAssistant,
    };
  } catch (error) {
    const aborted = input.signal?.aborted;
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
    input.onMessageUpdate?.(currentAssistant);

    if (aborted) {
      return {
        conversation,
        userMessage,
        assistantMessage: currentAssistant,
      };
    }

    throw error;
  }
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
