import * as Schema from "effect/Schema";
import { ContextModeSchema } from "../context";

export const defaultQuickActions = [
  "summarize",
  "explain",
  "explain-code",
  "rewrite",
  "translate",
  "simplify",
] as const;

export type DefaultQuickAction = (typeof defaultQuickActions)[number];

export type QuickActionId = DefaultQuickAction | (string & {});

export const PendingQuickActionSchema = Schema.Struct({
  actionId: Schema.String,
  tabId: Schema.optional(Schema.Number.pipe(Schema.int())),
  focus: Schema.optional(Schema.String),
  mode: Schema.optional(ContextModeSchema),
  createdAt: Schema.String,
});

export type PendingQuickAction = Schema.Schema.Type<typeof PendingQuickActionSchema> & {
  actionId: QuickActionId;
};

export function parsePendingQuickAction(value: unknown): PendingQuickAction {
  return Schema.decodeUnknownSync(PendingQuickActionSchema)(value) as PendingQuickAction;
}

export interface QuickActionDefinition {
  id: QuickActionId;
  label: string;
  prompt: string;
  requiresSelection?: boolean;
}

export const quickActionDefinitions: QuickActionDefinition[] = [
  {
    id: "summarize",
    label: "Summarize",
    prompt:
      "Summarize the page in a concise, useful way. Start with the main point, then list the most important details.",
  },
  {
    id: "explain",
    label: "Explain",
    prompt:
      "Explain the selected text or the most relevant page content clearly. Include necessary background and avoid jargon where possible.",
  },
  {
    id: "explain-code",
    label: "Explain code",
    prompt:
      "Explain the selected code or the code-like content on this page. Cover what it does, important inputs and outputs, and any notable edge cases.",
  },
  {
    id: "rewrite",
    label: "Rewrite",
    prompt:
      "Rewrite the selected text to be clearer and more polished while preserving the original meaning.",
    requiresSelection: true,
  },
  {
    id: "translate",
    label: "Translate",
    prompt:
      "Translate the selected text or most relevant page content into English. Preserve names, code, links, and technical terms when appropriate.",
  },
  {
    id: "simplify",
    label: "Simplify",
    prompt:
      "Simplify the selected text or page content. Use plain language and keep the important meaning intact.",
  },
];

export function getQuickActionDefinition(
  actionId: QuickActionId,
): QuickActionDefinition | undefined {
  return quickActionDefinitions.find((action) => action.id === actionId);
}

export function buildQuickActionPrompt(actionId: QuickActionId, focus?: string): string {
  const definition = getQuickActionDefinition(actionId);
  const basePrompt = definition?.prompt ?? `Help with this action: ${actionId}`;
  const trimmedFocus = focus?.trim();

  if (!trimmedFocus) {
    return basePrompt;
  }

  return `${basePrompt}\n\nSelected text:\n${trimmedFocus}`;
}
