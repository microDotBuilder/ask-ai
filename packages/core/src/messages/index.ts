import * as Schema from "effect/Schema";
import { QuickActionIdSchema } from "../actions";
import { ContextModeSchema, PageContextSchema } from "../context";

export const messageTypes = {
  openSidePanel: "OPEN_SIDE_PANEL",
  pageContextRequest: "PAGE_CONTEXT_REQUEST",
  pageContextResponse: "PAGE_CONTEXT_RESPONSE",
  quickActionRequest: "QUICK_ACTION_REQUEST",
  selectionChanged: "SELECTION_CHANGED",
  tabSessionUpdated: "TAB_SESSION_UPDATED",
} as const;

export const PageContextUnavailableReasonSchema = Schema.Literal(
  "browser-internal",
  "chrome-web-store",
  "pdf",
  "excluded-site",
  "sensitive-page",
  "content-script-unavailable",
  "extraction-failed",
);

const BlockedPageContextUnavailableSchema = Schema.Struct({
  availability: Schema.Literal("blocked"),
  reason: Schema.Literal("excluded-site", "sensitive-page"),
  message: Schema.String,
});

const UnsupportedPageContextUnavailableSchema = Schema.Struct({
  availability: Schema.Literal("unsupported"),
  reason: Schema.Literal(
    "browser-internal",
    "chrome-web-store",
    "pdf",
    "content-script-unavailable",
  ),
  message: Schema.String,
});

const FailedPageContextUnavailableSchema = Schema.Struct({
  availability: Schema.Literal("failed"),
  reason: Schema.Literal("content-script-unavailable", "extraction-failed"),
  message: Schema.String,
});

export const PageContextUnavailableSchema = Schema.Union(
  BlockedPageContextUnavailableSchema,
  UnsupportedPageContextUnavailableSchema,
  FailedPageContextUnavailableSchema,
);

export const PageContextRequestMessageSchema = Schema.Struct({
  type: Schema.Literal(messageTypes.pageContextRequest),
  tabId: Schema.optional(Schema.Number),
  mode: ContextModeSchema,
});

const AvailablePageContextResponseMessageSchema = Schema.Struct({
  type: Schema.Literal(messageTypes.pageContextResponse),
  tabId: Schema.optional(Schema.Number),
  status: Schema.Literal("available"),
  context: PageContextSchema,
});

const BlockedPageContextResponseMessageSchema = Schema.Struct({
  type: Schema.Literal(messageTypes.pageContextResponse),
  tabId: Schema.optional(Schema.Number),
  status: Schema.Literal("blocked"),
  unavailable: BlockedPageContextUnavailableSchema,
});

const UnsupportedPageContextResponseMessageSchema = Schema.Struct({
  type: Schema.Literal(messageTypes.pageContextResponse),
  tabId: Schema.optional(Schema.Number),
  status: Schema.Literal("unsupported"),
  unavailable: UnsupportedPageContextUnavailableSchema,
});

const FailedPageContextResponseMessageSchema = Schema.Struct({
  type: Schema.Literal(messageTypes.pageContextResponse),
  tabId: Schema.optional(Schema.Number),
  status: Schema.Literal("failed"),
  unavailable: FailedPageContextUnavailableSchema,
});

export const PageContextResponseMessageSchema = Schema.Union(
  AvailablePageContextResponseMessageSchema,
  BlockedPageContextResponseMessageSchema,
  UnsupportedPageContextResponseMessageSchema,
  FailedPageContextResponseMessageSchema,
);

export const SelectionChangedMessageSchema = Schema.Struct({
  type: Schema.Literal(messageTypes.selectionChanged),
  tabId: Schema.optional(Schema.Number),
  text: Schema.String,
  url: Schema.String,
  title: Schema.String,
});

export const OpenSidePanelMessageSchema = Schema.Struct({
  type: Schema.Literal(messageTypes.openSidePanel),
  tabId: Schema.optional(Schema.Number),
  conversationId: Schema.optional(Schema.String),
});

export const TabSessionUpdatedMessageSchema = Schema.Struct({
  type: Schema.Literal(messageTypes.tabSessionUpdated),
  tabSessionId: Schema.String,
  tabId: Schema.Number,
  url: Schema.String,
  title: Schema.String,
  active: Schema.Boolean,
});

export const QuickActionRequestMessageSchema = Schema.Struct({
  type: Schema.Literal(messageTypes.quickActionRequest),
  actionId: QuickActionIdSchema,
  tabId: Schema.optional(Schema.Number),
  conversationId: Schema.optional(Schema.String),
  focus: Schema.optional(Schema.String),
  mode: Schema.optional(ContextModeSchema),
});

export const ChromeMessageSchema = Schema.Union(
  PageContextRequestMessageSchema,
  PageContextResponseMessageSchema,
  SelectionChangedMessageSchema,
  OpenSidePanelMessageSchema,
  TabSessionUpdatedMessageSchema,
  QuickActionRequestMessageSchema,
);

export type PageContextRequestMessage = Schema.Schema.Type<typeof PageContextRequestMessageSchema>;
export type PageContextResponseMessage = Schema.Schema.Type<
  typeof PageContextResponseMessageSchema
>;
export type SelectionChangedMessage = Schema.Schema.Type<typeof SelectionChangedMessageSchema>;
export type OpenSidePanelMessage = Schema.Schema.Type<typeof OpenSidePanelMessageSchema>;
export type TabSessionUpdatedMessage = Schema.Schema.Type<typeof TabSessionUpdatedMessageSchema>;
export type QuickActionRequestMessage = Schema.Schema.Type<typeof QuickActionRequestMessageSchema>;
export type ChromeMessage = Schema.Schema.Type<typeof ChromeMessageSchema>;
export type MessageType = ChromeMessage["type"];

export const RuntimeMessageResponseSchemas = {
  [messageTypes.pageContextRequest]: PageContextResponseMessageSchema,
  [messageTypes.selectionChanged]: Schema.UndefinedOr(TabSessionUpdatedMessageSchema),
  [messageTypes.openSidePanel]: Schema.Undefined,
  [messageTypes.quickActionRequest]: Schema.Undefined,
  [messageTypes.pageContextResponse]: Schema.Undefined,
  [messageTypes.tabSessionUpdated]: Schema.Undefined,
} as const;

export const TabMessageResponseSchemas = {
  [messageTypes.pageContextRequest]: PageContextResponseMessageSchema,
  [messageTypes.selectionChanged]: Schema.UndefinedOr(TabSessionUpdatedMessageSchema),
  [messageTypes.openSidePanel]: Schema.Undefined,
  [messageTypes.quickActionRequest]: Schema.Undefined,
  [messageTypes.pageContextResponse]: Schema.Undefined,
  [messageTypes.tabSessionUpdated]: Schema.Undefined,
} as const;

export type RuntimeMessageResponse<TMessage extends ChromeMessage> =
  TMessage["type"] extends typeof messageTypes.pageContextRequest
    ? PageContextResponseMessage
    : TMessage["type"] extends typeof messageTypes.selectionChanged
      ? TabSessionUpdatedMessage | undefined
      : undefined;

export type TabMessageResponse<TMessage extends ChromeMessage> =
  TMessage["type"] extends typeof messageTypes.pageContextRequest
    ? PageContextResponseMessage
    : TMessage["type"] extends typeof messageTypes.selectionChanged
      ? TabSessionUpdatedMessage | undefined
      : undefined;

export function parseChromeMessage(message: unknown): ChromeMessage {
  return Schema.decodeUnknownSync(ChromeMessageSchema)(message);
}

export function parseRuntimeMessageResponse<TMessage extends ChromeMessage>(
  message: TMessage,
  response: unknown,
): RuntimeMessageResponse<TMessage> {
  const schema = RuntimeMessageResponseSchemas[message.type] as Schema.Schema<
    unknown,
    unknown,
    never
  >;
  return Schema.decodeUnknownSync(schema)(response) as RuntimeMessageResponse<TMessage>;
}

export function parseTabMessageResponse<TMessage extends ChromeMessage>(
  message: TMessage,
  response: unknown,
): TabMessageResponse<TMessage> {
  const schema = TabMessageResponseSchemas[message.type] as Schema.Schema<unknown, unknown, never>;
  return Schema.decodeUnknownSync(schema)(response) as TabMessageResponse<TMessage>;
}

export function safeParseChromeMessage(message: unknown):
  | {
      ok: true;
      message: ChromeMessage;
    }
  | {
      ok: false;
      error: unknown;
    } {
  try {
    return { ok: true, message: parseChromeMessage(message) };
  } catch (error) {
    return { ok: false, error };
  }
}
