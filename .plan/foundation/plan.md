# Foundation Implementation Plan

## Goal

Build the shared type, schema, storage, settings, encryption, and model-catalog foundation.

## Dependencies

- Scaffold plan complete.
- Workspace package imports working.

## Deliverables

- Effect Schema message contracts.
- Dexie schema and repository skeletons.
- Settings storage helpers.
- API key encryption helpers.
- Bundled model catalog shape.
- Storage usage and retention helpers.

## Tasks

### F1: Shared Domain Types

Status: complete

Steps:

- Define provider IDs for direct OpenAI and OpenRouter.
- Define model metadata types.
- Define routed model metadata for OpenRouter models, including Anthropic and Gemini routes.
- Define conversation/message/tab session types.
- Define context snapshot and metrics types.
- Define quick action IDs.
- Export shared types from `@askai/core`.

Acceptance:

- Domain types compile and are available to `@askai/db` and `apps/extension`.

### F2: Effect Schema Message Contracts

Status: complete

Steps:

- Add schemas for page context requests/responses.
- Add schemas for selection messages.
- Add schemas for side panel open messages.
- Add schemas for tab session update messages.
- Add schemas for quick action messages.
- Add parser helpers for unknown Chrome messages.

Acceptance:

- Message contracts infer TypeScript types.
- Invalid message payloads fail runtime validation.

### F3: Settings Schema

Status: complete

Steps:

- Define settings record schema.
- Include provider/default model settings.
- Include model visibility/favorites.
- Include context cap setting with default `120_000`.
- Include history/retention settings.
- Include excluded sites.
- Include AI suggestions setting.

Acceptance:

- Settings can be validated at runtime.
- Missing settings can be migrated to defaults.

### F4: API Key Encryption

Status: complete

Steps:

- Implement Web Crypto AES-GCM helpers.
- Define encrypted API key record schema.
- Add encode/decode helpers for encrypted value and IV.
- Add provider-key storage helpers over `chrome.storage.local`.
- Add connection-test service boundary.

Acceptance:

- API keys can be encrypted and decrypted locally.
- Raw keys are not stored as plain text.

### F5: Dexie Schema

Status: complete

Steps:

- Define Dexie database class.
- Add tables:
  - `conversations`
  - `messages`
  - `tabSessions`
  - `contextSnapshots`
  - `contextMetrics`
- Add schema version `1`.
- Add typed table exports.

Acceptance:

- Database initializes in extension pages.
- Tables are typed.

### F6: Repositories

Status: complete

Steps:

- Add conversation repository.
- Add message repository.
- Add tab session repository.
- Add context metrics repository.
- Add transaction helpers where needed.

Acceptance:

- Repositories cover create/read/update/delete for initial chat flow.

### F7: Storage Usage

Status: complete

Steps:

- Add `estimateStorageBytes`.
- Track message storage bytes.
- Track conversation storage bytes.
- Add total usage aggregation.
- Add browser storage estimate helper.
- Add persistent storage request/status helper.

Acceptance:

- Settings UI can display usage numbers later.

### F8: Retention Policy

Status: complete

Steps:

- Add default limits:
  - 250 conversations
  - 100 MB
  - 90 days
- Add pruning plan function.
- Prune oldest unpinned conversations first.
- Keep full deletion execution behind repository methods.

Acceptance:

- Retention logic can be tested without IndexedDB side effects.

### F9: Bundled Model Catalog

Status: complete

Steps:

- Define `ModelInfo`.
- Define `ModelCatalogResponse`.
- Add static curated catalog placeholder.
- Add curated OpenRouter entries for Anthropic and Gemini routes.
- Add provider-prefixed ID helpers:
  - `openai:${id}`
  - `openrouter:${id}`
- Add unavailable-model marking helper.
- Add `scripts/refresh-model-catalog.ts` placeholder.

Acceptance:

- App can read bundled model catalog.
- User preferences can key off internal model IDs.
- OpenRouter-routed Anthropic and Gemini models do not require separate provider IDs.

## Risks

- API key encryption without a passphrase is weaker than OS keychain storage.
- Dexie may need separate initialization handling in service worker versus extension pages.

## Done When

- Shared schemas and repositories compile.
- Settings and model catalog have defaults.
- API key encryption helpers work.
- Foundation tests can be added in the verification phase.
