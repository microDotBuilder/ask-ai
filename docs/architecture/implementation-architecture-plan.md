# Ask AI Implementation Architecture Plan

This document turns the product and architecture decisions into an implementation plan for the first working version of Ask AI.

Related docs:

- `docs/product/ask-ai-product-spec.md`
- `docs/architecture/app-stack-decisions.md`
- `docs/architecture/storage-and-database-decisions.md`
- `docs/architecture/runtime-policy-and-context-decisions.md`

## Architecture Summary

Ask AI is a Chrome MV3 extension with a tab-specific side panel assistant.

The extension has four main runtime areas:

- Background service worker.
- Content script.
- Side panel React app.
- Options/onboarding React app.

The side panel owns active chat and streaming provider requests. The background service worker coordinates tab/session behavior and Chrome APIs. The content script extracts page context and selected text. Dexie/IndexedDB stores conversations and messages. `chrome.storage.local` stores settings and encrypted API key records.

## Initial Stack

```txt
Runtime/package manager: Bun
Repo shape: Bun workspaces monorepo
Extension framework: WXT
Language: TypeScript
UI: React
Components: shadcn/ui with Base UI
Styling: Tailwind CSS
Icons: lucide-react
Async/errors: Effect
Schema validation: Effect Schema
Database: Dexie + IndexedDB
State: Zustand
Testing: Vitest + React Testing Library + Playwright
Lint/format: Biome
Providers: direct OpenAI + OpenRouter through one OpenAI-compatible client
Routed model families: Anthropic Claude and Google Gemini through OpenRouter
```

## Repo Structure

Initial structure:

```txt
apps/
  extension/
    entrypoints/
      background.ts
      content.ts
      sidepanel/
        index.html
        main.tsx
        App.tsx
      options/
        index.html
        main.tsx
        App.tsx
    src/
      background/
      content/
      sidepanel/
      options/
      chrome/
    wxt.config.ts
    package.json

packages/
  core/
    src/
      actions/
      context/
      crypto/
      messages/
      models/
      policy/
      prompts/
      providers/
      settings/
      tokens/
      types/
    package.json

  db/
    src/
      schema/
      repositories/
      migrations/
      retention/
      usage/
    package.json

  ui/
    src/
      components/
      icons/
      styles/
    package.json

  config/
    tsconfig/
    biome/
    vitest/
    package.json
```

Include `packages/config` from the initial scaffold so shared TypeScript, Biome, and test config has a single owner from the start.

## Package Responsibilities

### `apps/extension`

Owns extension runtime entrypoints and Chrome API integration.

Responsibilities:

- WXT configuration.
- Manifest permissions.
- Background service worker.
- Content script.
- Side panel app.
- Options/onboarding app.
- Chrome message transport wrappers.
- Browser API adapters.

### `packages/core`

Owns domain logic independent from React UI.

Responsibilities:

- Effect Schema message contracts.
- Provider interfaces and OpenAI-compatible stream parser.
- Prompt construction.
- Quick action definitions.
- Context extraction data shapes.
- Sensitive-page policy.
- API key encryption helpers.
- Model lists and model metadata.
- Settings schema.
- Storage size and token estimate helpers.

### `packages/db`

Owns local persistence.

Responsibilities:

- Dexie database.
- Schema versioning.
- Conversations repository.
- Messages repository.
- Tab sessions repository.
- Context metrics repository.
- Retention and pruning.
- Storage usage aggregation.

### `packages/ui`

Owns reusable UI components.

Responsibilities:

- shadcn/ui components.
- Shared buttons, inputs, dialogs, menus, tabs, switches, tooltips.
- Shared layout primitives.
- Theme tokens.

Keep screen-specific UI inside `apps/extension/src/sidepanel` or `apps/extension/src/options` until it is clearly reusable.

### `packages/config`

Owns shared repo tooling configuration.

Responsibilities:

- Shared TypeScript configs.
- Shared Biome config.
- Shared Vitest config.
- Any future shared Playwright or build config that becomes useful.

## Runtime Responsibilities

### Background Service Worker

Owns:

- Toolbar icon clicks.
- Keyboard commands.
- Context menu actions.
- Opening the side panel for the current tab.
- Tracking tab session metadata.
- Running URL-level sensitive-page checks.
- Routing messages to content scripts when central coordination is useful.

Does not own:

- Long-running provider streaming requests.
- React UI state.
- Full chat rendering.

### Content Script

Owns:

- Detecting current selected text.
- Showing the floating Ask AI button after text selection.
- Extracting visible structured full-page text.
- Extracting nearby surrounding text for selected text.
- Detecting DOM-level sensitive-page signals.
- Returning page metadata and context to the side panel/background.

Does not own:

- Provider requests.
- API keys.
- Conversation history.

### Side Panel App

Owns:

- Chat UI.
- Quick actions.
- Context status.
- Streaming request lifecycle.
- Active conversation state.
- Calling provider services.
- Writing messages during streaming.
- Showing tab/session-specific recent history.
- Showing blocked/unavailable page states.

### Options/Onboarding App

Owns:

- First-time setup.
- Provider selection.
- API key entry and connection test.
- Default provider/model selection.
- Model visibility and favorites.
- History settings.
- Storage usage display.
- Persistent storage request/status.
- Excluded sites.

## Message Contracts

All Chrome runtime messages should have Effect Schema contracts.

Initial message groups:

### Page Context

```ts
PAGE_CONTEXT_REQUEST
PAGE_CONTEXT_RESPONSE
```

Used by the side panel or background to request full-page context from the content script.

Response outcomes:

- `ok: true` with structured text and metrics.
- `ok: false` with `sensitive-page`.
- `ok: false` with `unsupported-page`.
- `ok: false` with `protected-page`.
- `ok: false` with `extraction-failed`.

### Selection

```ts
SELECTION_CHANGED
SELECTION_CONTEXT_REQUEST
SELECTION_CONTEXT_RESPONSE
```

Used for the floating selection button and selected-text workflows.

### Side Panel

```ts
OPEN_SIDE_PANEL
SIDE_PANEL_OPENED
SIDE_PANEL_CLOSED
```

Used to coordinate toolbar, keyboard, context menu, and selection-button entrypoints.

### Tab Session

```ts
TAB_SESSION_UPDATED
ACTIVE_TAB_CHANGED
TAB_URL_CHANGED
```

Used to keep tab-specific side panel state aligned with Chrome tab state.

### Quick Actions

```ts
QUICK_ACTION_TRIGGERED
```

Used when a context menu item, keyboard shortcut, or UI button triggers a quick action.

## Primary User Flows

### First-Time Onboarding

1. User installs extension.
2. User opens Ask AI.
3. Onboarding explains BYOK and local encrypted storage.
4. User chooses OpenAI or OpenRouter.
5. User enters API key.
6. Ask AI encrypts and stores the key in `chrome.storage.local`.
7. Ask AI tests the provider connection.
8. User chooses default model.
9. Ask AI requests persistent browser storage if history is enabled.
10. User lands in the side panel.

### Toolbar Click

1. User clicks the extension toolbar icon.
2. Background opens the side panel for the active tab.
3. Background or side panel checks tab URL policy.
4. Side panel requests page context.
5. Content script returns structured full-page context or a blocked/unavailable result.
6. Side panel shows chat UI or disabled state.

### Selected Text Floating Button

1. User selects text on a webpage.
2. Content script detects selection.
3. Floating Ask AI button appears near the selection.
4. User clicks the button.
5. Background opens side panel for the active tab.
6. Side panel receives selected text as focus.
7. Side panel requests selected-text surrounding context and full-page context.
8. User asks a question or chooses a quick action.

### Normal Chat Send

1. User enters a prompt.
2. Side panel validates provider settings and page status.
3. Side panel builds prompt with current tab context and active conversation messages.
4. Side panel creates a user message in Dexie.
5. Side panel creates an empty assistant message in Dexie.
6. Side panel streams response from provider.
7. Side panel updates UI as chunks arrive.
8. Side panel flushes assistant message updates to Dexie in batches.
9. On completion, side panel writes final assistant message metadata and storage usage.

### Quick Action

1. User clicks a quick action.
2. Side panel creates a visible user message representing the action.
3. Side panel builds the matching prompt template.
4. Side panel sends the provider request immediately.
5. Response streams into the active conversation.

Initial quick actions:

- Summarize.
- Explain.
- Explain code.
- Rewrite selected text.
- Translate.
- Simplify.

Prompt templates will be designed separately.

### Blocked Or Unsupported Page

1. User opens side panel on a blocked or unsupported page.
2. Ask AI does not extract context.
3. Sensitive pages disable chat, quick actions, and AI suggestions.
4. Unsupported or protected pages may still allow general chat or manually pasted text without page context.
5. Side panel shows the appropriate explanatory state.

PDF copy:

```txt
PDF pages are not supported yet. Copy and paste text here to ask about it.
```

Sensitive-page copy:

```txt
Ask AI is disabled on this page because it may contain sensitive information.
```

## Context Extraction Plan

V1 extracts structured full-page webpage context.

Extractor should preserve:

- Page title.
- URL and domain.
- Headings.
- Paragraphs.
- Lists.
- Code blocks.
- Reasonable table text.

Selected text behavior:

- Selected text is always included as focus.
- Nearby surrounding text is included when available.
- Selected text must not be truncated away.

Initial context cap:

- Use a character cap for MVP simplicity.
- Start with `120_000` characters before prompt assembly.
- Expose the context cap in settings so it can be adjusted during alpha.
- Track context size metrics in alpha.
- Revisit cap after alpha data.

If context exceeds cap:

- Preserve selected text first.
- Include structured page text up to cap.
- Add truncation marker.

Marker:

```txt
[Page context truncated because it exceeded the configured context limit.]
```

Store context metrics, not full context text, in history.

## Sensitive-Page And No-Context Policy

Initial URL-level no-context outcomes:

- `chrome://*`
- `chrome-extension://*`
- `edge://*`
- `about:*`
- Chrome Web Store URLs.
- PDF URLs or pages detected as PDF.
- User-excluded sites.

Initial DOM-level sensitive blocks:

- Password inputs.
- Credit-card/payment fields.
- Sensitive account/billing/auth indicators.

If either URL-level or DOM-level policy returns `sensitive-page`, Ask AI is disabled for that page. If policy returns `unsupported-page` or `protected-page`, Ask AI should not use page context but may allow general chat or manually pasted text.

## Provider Request Plan

Provider requests are made from the side panel through a provider service.

Reasons:

- Easier streaming.
- Avoids MV3 service worker lifetime issues.
- Keeps cancellation local to the visible chat UI.

Providers:

- Direct OpenAI.
- OpenRouter.

Both use one OpenAI-compatible provider client. Anthropic Claude and Google Gemini are V1 model routes through OpenRouter, not direct provider integrations.

Provider config:

```ts
type ProviderId = "openrouter" | "openai"

type ProviderConfig = {
  id: ProviderId
  baseUrl: string
  apiKey: string
  defaultHeaders?: Record<string, string>
}
```

Initial base URLs:

```txt
OpenAI Direct: https://api.openai.com/v1
OpenRouter: https://openrouter.ai/api/v1
```

Model lists are hardcoded in V1 and can become dynamic later.

## API Key Storage Plan

MVP uses Web Crypto AES-GCM.

Storage location:

```txt
chrome.storage.local
```

Encrypted key record shape:

```ts
type EncryptedApiKeyRecord = {
  provider: "openrouter" | "openai"
  keyId: string
  encryptedValue: string
  iv: string
  algorithm: "AES-GCM"
  createdAt: string
  updatedAt: string
}
```

No user passphrase is required in MVP.

Product copy:

```txt
Your API keys are encrypted and stored locally in your browser. They are only decrypted on your device when Ask AI sends a request to your selected provider.
```

Future options:

- Optional passphrase lock.
- Native companion app with OS keychain integration.

## Database Plan

Use Dexie and IndexedDB.

Initial tables:

- `conversations`
- `messages`
- `tabSessions`
- `contextSnapshots`
- `contextMetrics`

Store chat threads as separate message rows.

Do not store full extracted page context by default.

Track:

- `message.storageBytes`
- `conversation.storageBytes`
- total history usage
- persistent storage status

Initial retention:

- 250 conversations.
- 100 MB.
- 90 days.
- Prune oldest unpinned conversations first.

## Settings Plan

MVP settings:

- Provider keys.
- Default provider.
- Default model.
- Visible model list per provider.
- Favorite models.
- Context character cap.
- History enabled.
- Retention policy.
- Storage usage.
- Persistent storage status.
- Excluded sites for context and history.
- AI suggestions on or off.

Advanced settings can wait unless needed during implementation.

## Onboarding Plan

First-time onboarding starts inside the side panel.

Reasons:

- The user opened Ask AI to use it immediately.
- Provider setup should happen close to the first chat experience.
- The options page can still hold deeper settings after setup.

Initial side panel onboarding:

1. Explain that Ask AI uses the user's own provider key.
2. Let the user choose OpenAI or OpenRouter.
3. Let the user enter an API key.
4. Encrypt and store the API key locally.
5. Test the provider connection.
6. Let the user choose a default model.
7. Request persistent storage if history is enabled.

The options page remains available for:

- Changing provider keys.
- Changing default provider/model.
- Managing visible and favorite models.
- Storage/history settings.
- Excluded sites.
- Advanced settings later.

## Initial Model Policy

Model lists are hardcoded for V1.

The app should support:

- A default model per provider.
- User-hidden models.
- User-favorite models.
- Model selector in the side panel.

The exact model IDs should be verified against provider docs during implementation because model availability changes.

Use a small curated model list for each provider. Do not ship a large model catalog in V1.

OpenRouter is a general multi-provider route, not a Gemini-specific integration.

Ask AI can use OpenRouter for Anthropic Claude, Google Gemini, OpenAI, and other routed models, while still supporting direct OpenAI as a separate provider option.

Use a bundled model catalog with an external maintenance refresh script.

Initial approach:

- Ship a small static catalog of curated models.
- Store provider-prefixed internal model IDs, such as `openai:gpt-...` and `openrouter:provider/model`.
- Keep model capability overlays in code.
- Do not fetch model lists during normal app startup or side panel usage.
- Refresh provider model IDs through a separate script before release, monthly if needed, or when provider errors indicate a model no longer exists.
- Merge provider model-list output with bundled capability metadata during catalog generation.
- Fall back to the existing bundled catalog if the refresh script fails.
- Start with a curated OpenRouter set that includes Anthropic and Gemini routes, then expand direct provider integrations later.
- Let users hide models they do not want in the side panel model selector.
- Let users favorite models for faster access.

Model refresh script:

```txt
scripts/refresh-model-catalog.ts
```

The script should call:

```txt
GET https://api.openai.com/v1/models
GET https://openrouter.ai/api/v1/models
```

Generated catalog files can live under:

```txt
packages/core/src/models/generated/
```

Runtime behavior:

- Use the bundled generated catalog.
- Store user-hidden models, favorites, and defaults by internal model ID.
- If a provider returns a model-not-found error, mark that model unavailable locally.
- Hide unavailable models from the selector for that provider.
- Ask the user to choose another model.

Model catalog records should include:

```ts
type ModelInfo = {
  id: string
  provider: "openai" | "openrouter"
  displayName: string
  modelFamily: string
  enabled: boolean
  contextWindow?: number
  supportsStreaming: boolean
  supportsVision: boolean
  supportsReasoning: boolean
  reasoningEfforts?: Array<"none" | "minimal" | "low" | "medium" | "high" | "xhigh">
  defaultReasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh"
  defaultForAuto?: boolean
  routingProvider?: "openai" | "anthropic" | "google" | string
  description?: string
}
```

The model catalog should return:

```ts
type ModelCatalogResponse = {
  models: ModelInfo[]
  defaultModelId: string
  catalogVersion: string
  fetchedAt: string
}
```

Exact model IDs are deferred until implementation and should be verified before shipping.

## AI Suggestions Plan

AI suggestions are stubbed in the first scaffold and implemented after normal chat is stable.

Initial behavior:

- Include an AI suggestions setting.
- Include UI placement for future page-specific suggestions if useful.
- Do not run provider calls for AI suggestions in the first working chat build.

Later behavior:

- If enabled, opening the panel can extract local page context and request suggestions.
- The UI must visibly disclose when suggestions use a provider call.
- Suggestions should be cached per page/session where practical.

## Entry Point Build Order

Build entrypoints in this order:

1. Toolbar click opens side panel.
2. Side panel requests full-page context.
3. Normal chat streams a provider response.
4. Side panel quick actions.
5. Keyboard shortcut quick actions.
6. Selected-text floating button.
7. Context-menu quick actions.
8. AI-generated page suggestions.

Rationale:

- Toolbar flow proves the extension, context, provider, streaming, and storage foundation.
- Side panel quick actions prove the action pipeline before adding more entrypoints.
- Keyboard shortcuts should reuse the same default quick action pipeline.
- Selected-text and context-menu flows can reuse the same action and context pipeline.
- AI suggestions depend on stable context extraction, prompt construction, provider calls, and privacy disclosure.

## Implementation Phases

### Phase 1: Scaffold

- Create Bun workspace.
- Create WXT extension app.
- Create `core`, `db`, `ui`, and `config` packages.
- Configure TypeScript paths.
- Configure Tailwind.
- Configure Biome.
- Add minimal side panel and options entrypoints.

### Phase 2: Storage Foundation

- Add Dexie schema.
- Add repositories.
- Add storage usage estimation.
- Add retention utilities.
- Add persistent storage request/status helper.

### Phase 3: Runtime Messaging

- Add Effect Schema message contracts.
- Add message transport helpers.
- Wire toolbar click to side panel open.
- Wire side panel context request to content script response.
- Add blocked/unavailable page responses.

### Phase 4: Context Extraction

- Add structured page extractor.
- Add selected text detection.
- Add surrounding selected-text context.
- Add context cap and truncation marker.
- Add alpha context metrics.

### Phase 5: Provider And Streaming

- Add encrypted API key storage.
- Add OpenAI-compatible provider client.
- Add OpenRouter config.
- Add direct OpenAI config.
- Add streaming parser.
- Add cancellation.
- Add Effect-based error mapping.

### Phase 6: Chat UI

- Add side panel chat shell.
- Add model selector.
- Add context status.
- Add prompt input.
- Add streaming response rendering.
- Add message persistence during streaming.
- Add local tab/session history view.

### Phase 7: Quick Actions

- Add default quick actions.
- Add action prompt plumbing.
- Add selected-text rewrite and explain-code handling.
- Add quick action visible user messages.
- Add keyboard commands for default quick actions.

### Phase 8: Selected Text And Context Menu

- Add floating selected-text button.
- Wire selected text as focus.
- Add nearby surrounding text extraction.
- Add context-menu quick actions.
- Reuse the side panel action pipeline.

### Phase 9: AI Suggestions

- Keep setting and UI placement from earlier phases.
- Add generated suggestions after normal chat and quick actions are stable.
- Add visible provider-call disclosure.
- Add per-page/session suggestion cache.

### Phase 10: Onboarding And Settings

- Add first-time setup flow.
- Add provider connection test.
- Add model visibility/favorites.
- Add storage usage UI.
- Add retention settings.
- Add excluded sites settings.

### Phase 11: Verification

- Add Vitest coverage for core policies, providers, prompts, and storage utilities.
- Add React Testing Library coverage for side panel and options components.
- Add Playwright extension smoke tests.
- Manually test toolbar, selected text, blocked pages, streaming, and history.

## Remaining Open Questions Before Scaffold

- What exact hardcoded OpenRouter and OpenAI model IDs should ship first?
