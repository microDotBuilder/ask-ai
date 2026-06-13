import * as Schema from "effect/Schema";

export type ISODateString = string;
export type UrlString = string;

export const ISODateStringSchema = Schema.String;
export const UrlStringSchema = Schema.String;

export const ProviderIdSchema = Schema.Literal("openai", "openrouter");
export type ProviderId = Schema.Schema.Type<typeof ProviderIdSchema>;

export const InternalModelIdSchema = Schema.TemplateLiteral(
  ProviderIdSchema,
  Schema.Literal(":"),
  Schema.String,
);
export type InternalModelId = Schema.Schema.Type<typeof InternalModelIdSchema>;

export const ChatRoleSchema = Schema.Literal("system", "user", "assistant");
export type ChatRole = Schema.Schema.Type<typeof ChatRoleSchema>;

export const ConversationStatusSchema = Schema.Literal("active", "archived");
export type ConversationStatus = Schema.Schema.Type<typeof ConversationStatusSchema>;

export interface TimestampedRecord {
  id: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export const TimestampedRecordSchema = Schema.Struct({
  id: Schema.String,
  createdAt: ISODateStringSchema,
  updatedAt: ISODateStringSchema,
});

export const NonNegativeIntegerSchema = Schema.Number.pipe(Schema.int(), Schema.nonNegative());
export const PositiveIntegerSchema = Schema.Number.pipe(Schema.int(), Schema.positive());
