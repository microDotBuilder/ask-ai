import * as Schema from "effect/Schema";
import { InternalModelIdSchema, PositiveIntegerSchema, ProviderIdSchema } from "../types";

export const defaultContextTokenCap = 120_000;

export const SettingsSchema = Schema.Struct({
  defaultProviderId: ProviderIdSchema,
  defaultModelId: InternalModelIdSchema,
  favoriteModelIds: Schema.Array(InternalModelIdSchema),
  hiddenModelIds: Schema.Array(InternalModelIdSchema),
  contextTokenCap: PositiveIntegerSchema,
  saveHistory: Schema.Boolean,
  retention: Schema.Struct({
    maxConversations: PositiveIntegerSchema,
    maxStorageBytes: PositiveIntegerSchema,
    maxAgeDays: PositiveIntegerSchema,
    prunePinned: Schema.Boolean,
  }),
  excludedSites: Schema.Array(Schema.String),
  aiSuggestionsEnabled: Schema.Boolean,
});

export type AskAiSettings = Schema.Schema.Type<typeof SettingsSchema>;

export const defaultSettings: AskAiSettings = {
  defaultProviderId: "openai",
  defaultModelId: "openai:gpt-4.1-mini",
  favoriteModelIds: [],
  hiddenModelIds: [],
  contextTokenCap: defaultContextTokenCap,
  saveHistory: true,
  retention: {
    maxConversations: 250,
    maxStorageBytes: 100 * 1024 * 1024,
    maxAgeDays: 90,
    prunePinned: false,
  },
  excludedSites: [],
  aiSuggestionsEnabled: true,
};

export function parseSettings(value: unknown): AskAiSettings {
  return Schema.decodeUnknownSync(SettingsSchema)({
    ...defaultSettings,
    ...(typeof value === "object" && value !== null ? value : {}),
    retention: {
      ...defaultSettings.retention,
      ...(typeof value === "object" &&
      value !== null &&
      "retention" in value &&
      typeof value.retention === "object" &&
      value.retention !== null
        ? value.retention
        : {}),
    },
  }) as AskAiSettings;
}

export interface SettingsStorageArea {
  get(keys?: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export const settingsStorageKey = "askai.settings";

export async function readSettings(storageArea: SettingsStorageArea): Promise<AskAiSettings> {
  const record = await storageArea.get(settingsStorageKey);
  return parseSettings(record[settingsStorageKey]);
}

export async function writeSettings(
  storageArea: SettingsStorageArea,
  settings: AskAiSettings,
): Promise<void> {
  await storageArea.set({ [settingsStorageKey]: parseSettings(settings) });
}
