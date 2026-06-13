import * as Schema from "effect/Schema";
import { ISODateStringSchema, NonNegativeIntegerSchema, UrlStringSchema } from "../types";

export const ContextModeSchema = Schema.Literal("full-page");
export type ContextMode = Schema.Schema.Type<typeof ContextModeSchema>;

export const PageContextMetricsSchema = Schema.Struct({
  characterCount: NonNegativeIntegerSchema,
  extractedCharacterCount: NonNegativeIntegerSchema,
  truncatedCharacterCount: NonNegativeIntegerSchema,
  headingCount: NonNegativeIntegerSchema,
  paragraphCount: NonNegativeIntegerSchema,
  listCount: NonNegativeIntegerSchema,
  codeBlockCount: NonNegativeIntegerSchema,
  tableCount: NonNegativeIntegerSchema,
});

export type PageContextMetrics = Schema.Schema.Type<typeof PageContextMetricsSchema>;

export const PageContextSchema = Schema.Struct({
  title: Schema.String,
  url: UrlStringSchema,
  domain: Schema.String,
  mode: ContextModeSchema,
  text: Schema.String,
  truncated: Schema.Boolean,
  metrics: PageContextMetricsSchema,
});

export type PageContext = Schema.Schema.Type<typeof PageContextSchema>;

export const ContextSnapshotSchema = Schema.Struct({
  id: Schema.String,
  tabSessionId: Schema.String,
  conversationId: Schema.optional(Schema.String),
  url: UrlStringSchema,
  title: Schema.String,
  domain: Schema.String,
  mode: ContextModeSchema,
  extractedAt: ISODateStringSchema,
  characterCount: NonNegativeIntegerSchema,
  tokenEstimate: NonNegativeIntegerSchema,
  storageBytes: NonNegativeIntegerSchema,
  contextHash: Schema.optional(Schema.String),
  createdAt: ISODateStringSchema,
});

export type ContextSnapshot = Schema.Schema.Type<typeof ContextSnapshotSchema>;

export const ContextMetricsSchema = Schema.Struct({
  id: Schema.String,
  tabSessionId: Schema.String,
  conversationId: Schema.optional(Schema.String),
  url: UrlStringSchema,
  extractedTokenCount: NonNegativeIntegerSchema,
  includedTokenCount: NonNegativeIntegerSchema,
  cappedTokenCount: NonNegativeIntegerSchema,
  storageBytes: NonNegativeIntegerSchema,
  createdAt: ISODateStringSchema,
});

export type ContextMetrics = Schema.Schema.Type<typeof ContextMetricsSchema>;

export function parsePageContext(value: unknown): PageContext {
  return Schema.decodeUnknownSync(PageContextSchema)(value);
}

export function parseContextSnapshot(value: unknown): ContextSnapshot {
  return Schema.decodeUnknownSync(ContextSnapshotSchema)(value);
}

export function parseContextMetrics(value: unknown): ContextMetrics {
  return Schema.decodeUnknownSync(ContextMetricsSchema)(value);
}
