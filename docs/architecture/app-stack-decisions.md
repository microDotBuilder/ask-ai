# Ask AI App Stack Decisions

This document records the current application stack decisions for Ask AI before the detailed module and folder structure is finalized.

## Current Decisions

- Ask AI will be built as a Chrome extension.
- The extension will use Manifest V3.
- The minimum Chrome version is Chrome 116+.
- The repo will use a small Bun workspace monorepo.
- The extension app will use WXT.
- The UI will use React and TypeScript.
- Styling will use Tailwind CSS.
- UI components will use shadcn/ui with Base UI primitives.
- Icons will use lucide-react.
- Persistent app data will use Dexie over IndexedDB.
- Small extension settings will use `chrome.storage.local`.
- Effect will be used for provider clients, typed errors, validation, and async application services.
- Zustand will be used for ephemeral UI state.
- Provider requests will use one OpenAI-compatible provider client architecture.
- V1 will support direct OpenAI and OpenRouter.
- Anthropic Claude and Google Gemini models will be supported through OpenRouter routes in V1, not direct provider integrations.
- Bun will be the package manager and script runner.

## Runtime And Package Manager

Use Bun for package management and scripts.

Expected files:

```txt
package.json
bun.lock
```

Use Bun workspaces from the root `package.json`.

Example:

```json
{
  "workspaces": [
    "apps/*",
    "packages/*"
  ]
}
```

## Repo Shape

Ask AI should use a small monorepo because the extension has multiple entrypoints that need shared domain, storage, provider, and UI code.

Recommended structure:

```txt
apps/
  extension/
    entrypoints/
      background.ts
      content.ts
      sidepanel/
      options/
    wxt.config.ts
    package.json

packages/
  core/
    package.json
    src/

  db/
    package.json
    src/

  ui/
    package.json
    src/

  config/
    package.json
```

### `apps/extension`

Owns the Chrome extension application.

Responsibilities:

- WXT configuration.
- Manifest configuration.
- Background service worker entrypoint.
- Content script entrypoint.
- Side panel React app.
- Options/settings React app.
- Extension permissions.
- Chrome API integration.

### `packages/core`

Owns product/domain logic that should not depend on React or Chrome UI.

Responsibilities:

- Shared domain types.
- Provider interfaces.
- Prompt construction.
- Quick action definitions.
- Sensitive-page policy.
- Context metadata types.
- Storage usage estimation helpers.
- Token estimate helpers.
- Shared constants.

### `packages/db`

Owns local database code.

Responsibilities:

- Dexie database setup.
- Schema versions and migrations.
- Conversation repository.
- Message repository.
- Tab session repository.
- Retention policy enforcement.
- Storage usage aggregation.

### `packages/ui`

Owns shared UI components.

Responsibilities:

- shadcn/ui components.
- Shared Ask AI UI primitives.
- Shared theme tokens.
- Icons and common layout components.

Keep extension-specific screens inside `apps/extension`. Only move reusable UI into `packages/ui`.

### `packages/config`

Owns shared tooling config when useful.

Responsibilities:

- Shared TypeScript config.
- Shared Biome config if needed.
- Shared test config if needed.

This package can stay small or be skipped until duplication appears.

## Extension Framework

Use WXT.

Reasons:

- It is built specifically for browser extensions.
- It supports Manifest V3.
- It handles multiple extension entrypoints.
- It generates the final extension manifest.
- It keeps the app close to standard Chrome extension APIs.

Do not use Next.js for this project. Ask AI is an extension with multiple browser-controlled entrypoints, not a server-rendered web app.

## Extension Entrypoints

Initial WXT entrypoints:

```txt
entrypoints/background.ts
entrypoints/content.ts
entrypoints/sidepanel/index.html
entrypoints/sidepanel/main.tsx
entrypoints/options/index.html
entrypoints/options/main.tsx
```

### Background Service Worker

Responsibilities:

- Track tab session metadata.
- Coordinate side panel open behavior.
- Handle toolbar icon clicks.
- Handle keyboard shortcuts.
- Handle context menu actions.
- Enforce sensitive-page policy before asking content scripts for context.
- Broker Chrome APIs where central coordination is useful.

The background service worker should not own long-running streaming provider responses in V1.

### Content Script

Responsibilities:

- Detect selected text.
- Show the floating Ask AI selection button.
- Extract full page text for allowed pages.
- Report page metadata.
- Detect sensitive DOM signals such as password or payment fields.

The content script should not call AI providers.

### Side Panel App

Responsibilities:

- Render the chat UI.
- Render context status and quick actions.
- Own active streaming request lifecycle.
- Call provider services.
- Store conversations and messages through `packages/db`.
- Show local history relevant to the current tab/session by default.

The side panel may call OpenAI/OpenRouter directly through provider service modules. This avoids Manifest V3 service worker lifetime problems during streaming.

### Options App

Responsibilities:

- Provider setup.
- API key management.
- Default model selection.
- History settings.
- Storage usage display.
- Persistent storage status.
- Excluded sites.
- Advanced settings that remain in V1.

## UI Stack

Use:

```txt
React
TypeScript
Tailwind CSS
shadcn/ui
Base UI
lucide-react
```

### shadcn/ui With Base UI

Use shadcn/ui as the component starting point and select Base UI as the primitive layer.

Reasons:

- Components are copied into the repo and can be customized.
- Tailwind styling fits the side panel and options UI.
- Base UI provides accessible unstyled primitives.
- shadcn/ui gives practical defaults for buttons, dialogs, menus, tabs, switches, tooltips, and forms.

Use raw Base UI only when a shadcn/ui component needs deeper behavior customization.

## State Management

Use two state layers.

### Zustand

Use Zustand for ephemeral UI state:

- Draft prompt.
- Current side panel view state.
- Current streaming status.
- Selected quick action.
- Active popovers/dialogs.
- Temporary extracted context preview state.

Zustand is not the source of truth for persisted history.

### Dexie And IndexedDB

Use Dexie over IndexedDB for persisted app data:

- Conversations.
- Messages.
- Tab sessions.
- Context metadata.
- History metadata.
- Storage accounting.

The storage decisions are recorded in:

```txt
docs/architecture/storage-and-database-decisions.md
```

## Effect Usage

Use Effect for application services where typed failure, cancellation, and composition matter.

Recommended Effect areas:

- Provider clients.
- Streaming response parsing.
- Request cancellation.
- Error classification.
- Provider retry behavior.
- Settings validation.
- Prompt construction.
- Storage services.
- Sensitive-page policy.

Do not force every React component to use Effect directly. React components should call hooks/controllers that wrap the Effect services.

Suggested boundary:

```txt
React component
  useChatController()

Chat controller
  calls ChatService.sendMessage()

ChatService
  Effect-based provider, prompt, policy, and storage pipeline
```

## Provider Architecture

V1 supports:

- Direct OpenAI.
- OpenRouter.

OpenRouter can access Anthropic Claude, Google Gemini, OpenAI, and other routed models. Direct OpenAI remains a separate supported provider for users who already have OpenAI API keys or prefer avoiding an extra provider layer.

Reasons to support both:

- Direct OpenAI is useful for users who already have OpenAI API keys.
- Direct OpenAI removes one third-party layer for users who prefer that.
- OpenRouter gives one coherent route to Anthropic, Gemini, OpenAI, and other models without building separate provider clients first.
- Both can share an OpenAI-compatible request implementation.

### Provider Client Interface

Use one OpenAI-compatible internal provider interface.

```ts
type ProviderId = "openrouter" | "openai"

type ProviderConfig = {
  id: ProviderId
  baseUrl: string
  apiKey: string
  defaultHeaders?: Record<string, string>
}

type ChatRequest = {
  provider: ProviderId
  model: string
  messages: Array<{
    role: "system" | "user" | "assistant"
    content: string
  }>
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
}

type ChatChunk = {
  contentDelta: string
  finishReason?: string
  raw?: unknown
}

type ProviderClient = {
  streamChat(request: ChatRequest): AsyncIterable<ChatChunk>
}
```

Provider configs:

```txt
OpenAI Direct
  baseUrl: https://api.openai.com/v1

OpenRouter
  baseUrl: https://openrouter.ai/api/v1
```

Provider-specific headers and behavior should be isolated behind provider config.

Anthropic and Gemini should appear as OpenRouter model routes or catalog metadata, not as `ProviderId` values, until direct provider integrations are intentionally added.

## Database Stack

Use:

```txt
Dexie
dexie-react-hooks
IndexedDB
```

Store whole chat threads as separate message rows linked to a conversation.

Do not store full extracted page context by default.

Track `storageBytes` on messages and conversations.

## Validation And Types

Use:

```txt
TypeScript
Effect Schema
```

Use Effect Schema for:

- Settings records.
- Provider configuration records.
- Stored database records.
- Provider response parsing where useful.
- Import/export payloads if added later.

## Testing Stack

Use:

```txt
Vitest
React Testing Library
Playwright
```

### Vitest

Use Vitest for:

- Prompt construction.
- Provider stream parsing.
- Storage usage estimation.
- Retention policy.
- Sensitive-page policy.
- Database repository behavior.
- Settings validation.

### React Testing Library

Use React Testing Library for:

- Side panel components.
- Options/settings components.
- Chat input behavior.
- Context status UI.
- History UI.

### Playwright

Use Playwright for:

- Loading the built extension in Chromium.
- Side panel flow checks.
- Selection button behavior.
- Content script extraction behavior.
- Options page checks.
- Streaming UI behavior.

## Linting And Formatting

Use Biome for linting and formatting.

Reasons:

- Fast.
- Simple setup.
- Good fit with TypeScript monorepos.
- Avoids separate ESLint and Prettier configuration unless a specific plugin is needed later.

## Current Stack Summary

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

## Open Questions

- Should `packages/config` exist immediately or only after tooling duplication appears?
- Should provider model lists be static JSON files in `packages/core` or fetched dynamically later?
- Should the first implementation include the options app immediately, or start with a minimal setup screen inside the side panel?
- Should Playwright extension tests be added during scaffold or after the first working side panel flow?
