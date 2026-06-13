import * as Schema from "effect/Schema";
import {
  ChatRoleSchema,
  ConversationStatusSchema,
  InternalModelIdSchema,
  ISODateStringSchema,
  NonNegativeIntegerSchema,
  ProviderIdSchema,
  UrlStringSchema,
  type ChatRole,
  type ConversationStatus,
  type InternalModelId,
  type ISODateString,
  type ProviderId,
  type TimestampedRecord,
  type UrlString,
} from "../types";

export const ConversationRecordSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  status: ConversationStatusSchema,
  pinned: Schema.Boolean,
  providerId: ProviderIdSchema,
  modelId: InternalModelIdSchema,
  sourceUrl: Schema.optional(UrlStringSchema),
  lastMessageAt: Schema.optional(ISODateStringSchema),
  storageBytes: NonNegativeIntegerSchema,
  activeChildId: Schema.optional(Schema.String),
  createdAt: ISODateStringSchema,
  updatedAt: ISODateStringSchema,
});

export interface ConversationRecord extends TimestampedRecord {
  title: string;
  status: ConversationStatus;
  pinned: boolean;
  providerId: ProviderId;
  modelId: InternalModelId;
  sourceUrl?: UrlString;
  lastMessageAt?: ISODateString;
  storageBytes: number;
  activeChildId?: string;
}

export const ChatMessageRecordSchema = Schema.Struct({
  id: Schema.String,
  conversationId: Schema.String,
  role: ChatRoleSchema,
  content: Schema.String,
  tokenEstimate: NonNegativeIntegerSchema,
  storageBytes: NonNegativeIntegerSchema,
  status: Schema.optional(Schema.Literal("complete", "streaming", "failed", "cancelled")),
  error: Schema.optional(
    Schema.Struct({
      message: Schema.String,
      code: Schema.optional(Schema.String),
    }),
  ),
  finishReason: Schema.optional(Schema.String),
  parentMessageId: Schema.optional(Schema.String),
  activeChildId: Schema.optional(Schema.String),
  providerId: Schema.optional(ProviderIdSchema),
  modelId: Schema.optional(InternalModelIdSchema),
  editedAt: Schema.optional(ISODateStringSchema),
  createdAt: ISODateStringSchema,
  updatedAt: ISODateStringSchema,
});

export interface ChatMessageRecord extends TimestampedRecord {
  conversationId: string;
  role: ChatRole;
  content: string;
  tokenEstimate: number;
  storageBytes: number;
  status?: "complete" | "streaming" | "failed" | "cancelled";
  error?: {
    message: string;
    code?: string;
  };
  finishReason?: string;
  parentMessageId?: string;
  activeChildId?: string;
  providerId?: ProviderId;
  modelId?: InternalModelId;
  editedAt?: ISODateString;
}

export const TabSessionRecordSchema = Schema.Struct({
  id: Schema.String,
  tabId: Schema.Number.pipe(Schema.int()),
  windowId: Schema.optional(Schema.Number.pipe(Schema.int())),
  url: UrlStringSchema,
  title: Schema.String,
  active: Schema.Boolean,
  conversationId: Schema.optional(Schema.String),
  lastContextSnapshotId: Schema.optional(Schema.String),
  createdAt: ISODateStringSchema,
  updatedAt: ISODateStringSchema,
});

export interface TabSessionRecord extends TimestampedRecord {
  tabId: number;
  windowId?: number;
  url: UrlString;
  title: string;
  active: boolean;
  conversationId?: string;
  lastContextSnapshotId?: string;
}

export function parseConversationRecord(value: unknown): ConversationRecord {
  return Schema.decodeUnknownSync(ConversationRecordSchema)(value);
}

export function parseChatMessageRecord(value: unknown): ChatMessageRecord {
  return Schema.decodeUnknownSync(ChatMessageRecordSchema)(value);
}

export function parseTabSessionRecord(value: unknown): TabSessionRecord {
  return Schema.decodeUnknownSync(TabSessionRecordSchema)(value);
}

export { walkActivePath } from "./walk";
export type { ActivePathResult, SiblingInfo } from "./walk";
