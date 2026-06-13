# Effect Migration Plan

## Goal

Use Effect and Effect Schema where they improve type safety across runtime, storage, provider, and async-service boundaries without turning pure domain helpers or React rendering into unnecessary Effect code.

## Current Position

The architecture already chooses Effect for provider clients, typed errors, validation, and async application services.

Some Effect Schema exists today, but several high-risk boundaries still rely on optional fields, unchecked casts, thrown errors, and unvalidated external data.

## Dependencies

- Foundation package boundaries exist.
- Core message and settings schemas exist.
- Runtime messaging, page extraction, and chat streaming are already scaffolded.
- Verification dependencies need repair before this migration can be fully tested.

References:

- `docs/architecture/app-stack-decisions.md:18`
- `docs/architecture/implementation-architecture-plan.md:36`
- `docs/architecture/implementation-architecture-plan.md:137`
- `docs/architecture/runtime-policy-and-context-decisions.md:54`
- `packages/core/src/messages/index.ts:1`
- `packages/core/src/providers/index.ts:1`

## Deliverables

- Strong discriminated schemas for runtime messages and persisted records.
- Typed Chrome message helpers that validate request and response payloads.
- Provider client APIs that expose typed Effect errors.
- Chat workflow represented as a typed Effect service with a Promise adapter for React.
- Storage helpers that decode unknown browser/Dexie data before use.
- Context persistence aligned with privacy docs.
- Tests covering invalid payloads, provider errors, persistence validation, and chat error mapping.

## Tasks

### E1: Define Shared Effect Schema Boundaries

Status: pending

Purpose:

- Establish one schema source of truth for domain records that cross process, storage, or provider boundaries.
- Avoid duplicate interface/schema definitions that drift apart.

Steps:

- Add or consolidate schemas for:
  - `ProviderId`
  - `InternalModelId`
  - `ContextMode`
  - `PageContext`
  - `PageContextMetrics`
  - `ConversationRecord`
  - `ChatMessageRecord`
  - `TabSessionRecord`
  - `ContextSnapshot`
  - `ContextMetrics`
- Export inferred types from schemas where practical.
- Keep template-literal branded types like `InternalModelId` behind constructors or schema refinements.
- Add decode helpers for unknown data and unsafe constructor helpers only for trusted test fixtures.

Acceptance:

- Domain schemas infer the public TypeScript types.
- Code that reads unknown browser/provider/DB data goes through a decode helper.
- Pure helpers can still accept normal typed inputs without `Effect` wrappers.

References:

- `packages/core/src/types/index.ts:1`
- `packages/core/src/context/index.ts:3`
- `packages/core/src/conversations/index.ts:11`
- `packages/core/src/settings/index.ts:6`
- `packages/core/src/models/index.ts:32`
- `docs/architecture/implementation-architecture-plan.md:131`

### E2: Tighten Chrome Runtime Message Contracts

Status: pending

Purpose:

- Encode message invariants in Effect Schema instead of checking invalid combinations later in UI code.

Steps:

- Replace `PageContextResponseMessageSchema` with a discriminated union:
  - available response requires `status: "available"` and `context`.
  - blocked/unsupported/failed responses require matching `unavailable`.
  - unavailable availability must match response status.
- Add distinct schemas for messages that expect responses, especially:
  - `PAGE_CONTEXT_REQUEST` -> `PAGE_CONTEXT_RESPONSE`
  - `SELECTION_CHANGED` -> optional `TAB_SESSION_UPDATED`
  - `QUICK_ACTION_REQUEST` -> no response or explicit ack.
- Rename or align `QUICK_ACTION_REQUEST` with docs if the product contract should be `QUICK_ACTION_TRIGGERED`.
- Add tests proving impossible states fail decoding.

Acceptance:

- `status: "available"` without `context` fails schema validation.
- unavailable responses cannot carry mismatched status/reason structures.
- UI no longer needs defensive fallback for structurally invalid page-context responses.

References:

- `packages/core/src/messages/index.ts:56`
- `packages/core/src/messages/index.ts:62`
- `apps/extension/entrypoints/sidepanel/App.tsx:43`
- `docs/architecture/runtime-policy-and-context-decisions.md:81`
- `docs/architecture/implementation-architecture-plan.md:767`

### E3: Add Typed Chrome Transport Helpers

Status: pending

Purpose:

- Remove unchecked response casts at the Chrome API boundary.

Steps:

- Introduce a message contract map that binds request message types to response schemas.
- Update `sendRuntimeMessage` and `sendTabMessage` to accept a response schema or infer one from the contract map.
- Decode outbound request payloads before sending.
- Decode inbound response payloads before resolving.
- Convert `chrome.runtime.lastError` to a tagged error.
- Decide whether listener failures return no response, explicit error response, or typed `ChromeMessageError`.

Acceptance:

- No `response as TResponse` cast remains in the message helpers.
- Callers receive typed decoded responses or typed transport errors.
- Background/content/sidepanel listener responses are validated before `sendResponse`.

References:

- `apps/extension/src/chrome/index.ts:26`
- `apps/extension/src/chrome/index.ts:40`
- `apps/extension/src/chrome/index.ts:45`
- `apps/extension/src/chrome/index.ts:60`
- `apps/extension/src/chrome/index.ts:65`
- `apps/extension/entrypoints/background.ts:273`
- `apps/extension/entrypoints/sidepanel/App.tsx:304`

### E4: Validate Settings, API Keys, And Session Storage At Boundaries

Status: pending

Purpose:

- Browser storage returns unknown data. Every read should validate shape before the app trusts it.

Steps:

- Replace `AskAiSettings = Schema.Type & manual override` with schema-level provider/model refinements.
- Add positive integer/size refinements for retention and context cap fields.
- Add schema for `PendingQuickAction`.
- Decode `chrome.storage.session` pending action reads instead of casting.
- Add tagged errors for malformed settings, malformed API key records, missing encryption keys, and crypto failures.
- Decide whether settings should use `chrome.storage.local` or `chrome.storage.sync`; docs currently say small settings use local.

Acceptance:

- Invalid settings are defaulted or surfaced through typed errors consistently.
- Invalid pending quick actions are ignored with a typed parse failure, not cast.
- API key storage/decryption failures have explicit typed errors.

References:

- `packages/core/src/settings/index.ts:23`
- `packages/core/src/settings/index.ts:47`
- `packages/core/src/crypto/index.ts:7`
- `apps/extension/src/product/index.ts:58`
- `apps/extension/src/product/index.ts:87`
- `apps/extension/src/product/index.ts:171`
- `docs/architecture/storage-and-database-decisions.md:13`
- `docs/architecture/implementation-architecture-plan.md:500`

### E5: Move Provider Client And SSE Parsing To Typed Effect APIs

Status: pending

Purpose:

- Provider responses are untrusted external data and should be parsed into typed success/error values.

Steps:

- Define Effect Schemas for OpenAI-compatible stream events:
  - chat completion chunk.
  - provider error payload.
  - finish reason payload.
- Replace manual `Record<string, unknown>` casts in SSE parsing with schema decoding.
- Return typed parser errors instead of encoding malformed JSON as a provider stream chunk.
- Create a provider client function that returns `Effect`:
  - missing/invalid config.
  - HTTP failure.
  - no readable stream.
  - malformed event.
  - provider error.
  - aborted request.
- Keep OpenAI and OpenRouter under one OpenAI-compatible client.

Acceptance:

- Provider parsing has no unchecked JSON shape casts.
- Provider errors are represented as tagged errors, not generic `Error`.
- Chat flow can pattern-match provider failures by tag/code.

References:

- `packages/core/src/providers/index.ts:72`
- `packages/core/src/providers/index.ts:142`
- `packages/core/src/providers/index.ts:165`
- `packages/core/src/providers/index.ts:187`
- `apps/extension/src/sidepanel/chat.ts:361`
- `docs/architecture/implementation-architecture-plan.md:461`
- `docs/architecture/implementation-architecture-plan.md:783`

### E6: Refactor Chat Workflow Into An Effect Service

Status: pending

Purpose:

- The chat service is the highest-risk async workflow: it combines settings, encryption, DB, prompt assembly, provider streaming, cancellation, and persistence.

Steps:

- Define a `ChatServiceError` tagged-error union:
  - `ContextUnavailable`
  - `MissingApiKey`
  - `MissingEncryptionKey`
  - `InvalidSettings`
  - `StorageFailure`
  - `ProviderHttpError`
  - `ProviderStreamError`
  - `StreamUnavailable`
  - `RequestAborted`
- Convert internal functions in `chat.ts` to `Effect.gen` incrementally.
- Keep a `streamChat(): Promise<...>` adapter for React while implementation uses `Effect`.
- Model streaming callbacks as explicit sinks:
  - message persisted.
  - assistant chunk flushed.
  - conversation ready.
- Preserve current cancellation behavior but map abort to a typed result.
- Add tests around error mapping and partial assistant message persistence.

Acceptance:

- React catches mapped user-facing errors from a narrow adapter.
- Chat internals do not use generic `throw new Error` for expected failure modes.
- Provider, storage, settings, and crypto failures are distinguishable.

References:

- `apps/extension/src/sidepanel/chat.ts:28`
- `apps/extension/src/sidepanel/chat.ts:170`
- `apps/extension/src/sidepanel/chat.ts:284`
- `apps/extension/src/sidepanel/chat.ts:361`
- `apps/extension/src/sidepanel/chat.ts:429`
- `apps/extension/entrypoints/sidepanel/App.tsx:364`
- `docs/architecture/implementation-architecture-plan.md:461`
- `docs/architecture/implementation-architecture-plan.md:783`

### E7: Add Persisted Record Schemas To Dexie Repositories

Status: pending

Purpose:

- Dexie table types provide compile-time help but do not validate runtime data already stored in IndexedDB.

Steps:

- Add schemas for each table record.
- Validate records before `add`, `put`, and relevant `update` calls.
- Decode records returned by repository reads before returning them to application code.
- Add typed repository errors:
  - validation failure.
  - database unavailable.
  - transaction failure.
- Decide a policy for corrupted existing records:
  - skip invalid records.
  - surface error.
  - quarantine/delete only with explicit migration.

Acceptance:

- Repository methods never return unchecked persisted records.
- Invalid records cannot be inserted through repository APIs.
- Tests cover malformed stored records and write validation.

References:

- `packages/db/src/schema/index.ts:14`
- `packages/db/src/schema/index.ts:24`
- `packages/db/src/repositories/index.ts:22`
- `packages/db/src/repositories/index.ts:63`
- `packages/db/src/repositories/index.ts:86`
- `packages/db/src/repositories/index.ts:110`
- `docs/architecture/storage-and-database-decisions.md:38`
- `docs/architecture/implementation-architecture-plan.md:148`

### E8: Align Context Persistence With Privacy Docs

Status: pending

Purpose:

- The product and architecture docs say full extracted page context should not be stored in history by default, but current code stores it in context snapshots.

Steps:

- Change `ContextSnapshot` schema to metadata-only:
  - page title.
  - URL/domain.
  - mode.
  - extracted timestamp.
  - char/token metrics.
  - hash of context if needed.
- Remove `text` from persisted `ContextSnapshot`.
- Persist `ContextMetrics` separately for alpha analysis.
- Update chat persistence to store only context metadata and metrics.
- Add a migration plan for any existing version-1 snapshots with `text`.

Acceptance:

- Full extracted page context is not persisted by normal chat.
- Tests prove context snapshot records contain no `text`.
- Storage behavior matches product/privacy docs.

References:

- `packages/core/src/context/index.ts:26`
- `packages/core/src/context/index.ts:33`
- `apps/extension/src/sidepanel/chat.ts:190`
- `apps/extension/src/sidepanel/chat.ts:200`
- `docs/architecture/storage-and-database-decisions.md:15`
- `docs/architecture/storage-and-database-decisions.md:169`
- `docs/architecture/storage-and-database-decisions.md:190`
- `docs/architecture/implementation-architecture-plan.md:439`
- `docs/architecture/implementation-architecture-plan.md:551`

### E9: Fix Selected-Text Context Semantics

Status: pending

Purpose:

- Product says selected text is focus and full-page context remains included by default. Current extraction can return selected text only for `mode: "selection"`.

Steps:

- Treat selected/pasted text as `focus`, not as a separate selected-text-only context mode.
- Keep V1 context mode as `full-page`, unless a later feature explicitly adds other modes.
- Update message schemas so quick actions carry optional `focus`.
- Update content extraction to return full structured page context while preserving selected text separately.
- Add nearby surrounding selected-text context later if needed.
- Update prompt assembly to prioritize focus and prevent it from being truncated away.

Acceptance:

- Selected-text flows include full-page context plus focus.
- There is no selected-text-only mode in V1 runtime contracts unless intentionally reintroduced.
- Prompt truncation keeps focus before page context.

References:

- `docs/product/ask-ai-product-spec.md:62`
- `docs/product/ask-ai-product-spec.md:73`
- `docs/product/ask-ai-product-spec.md:77`
- `docs/architecture/implementation-architecture-plan.md:427`
- `packages/core/src/messages/index.ts:12`
- `apps/extension/src/content/extraction.ts:199`
- `apps/extension/src/content/extraction.ts:206`
- `packages/core/src/prompts/index.ts:46`

### E10: Keep React UI As A Consumer Of Typed Results

Status: pending

Purpose:

- React should render application state and call typed service adapters. It should not own runtime validation or Effect internals.

Steps:

- Keep component state as discriminated UI state.
- Convert service errors into a small UI-facing error model at adapter boundaries.
- Remove casts in event handlers by decoding select values through schemas or model lookup.
- Use typed service functions for:
  - load settings.
  - save settings.
  - test provider connection.
  - request context.
  - stream chat.
- Keep `Effect.runPromise` out of components where possible; expose plain Promise adapters from service modules.

Acceptance:

- Components do not cast unknown runtime values into domain types.
- Components display typed service errors consistently.
- Effect does not leak into JSX except through small adapter calls if needed.

References:

- `apps/extension/entrypoints/sidepanel/App.tsx:203`
- `apps/extension/entrypoints/sidepanel/App.tsx:226`
- `apps/extension/entrypoints/sidepanel/App.tsx:304`
- `apps/extension/entrypoints/sidepanel/App.tsx:411`
- `apps/extension/entrypoints/options/App.tsx:219`
- `apps/extension/entrypoints/options/App.tsx:246`

### E11: Repair Verification Setup And Add Migration Tests

Status: pending

Purpose:

- Type safety changes need regression tests around invalid runtime data.

Steps:

- Fix workspace dependency resolution for `fake-indexeddb/auto` in db tests.
- Fix workspace dependency resolution for `jsdom` in extension tests.
- Add core schema tests for:
  - invalid page-context response states.
  - invalid provider chunks.
  - invalid settings and pending quick actions.
  - invalid model IDs.
- Add db tests for:
  - invalid persisted records.
  - context snapshots without full text.
  - migration/quarantine behavior.
- Add extension tests for:
  - message response decoding.
  - context request failure mapping.
  - quick-action focus handling.
- Keep `bun run typecheck` as a required gate.

Acceptance:

- `bun run typecheck` passes.
- `bun run test` passes after dependency setup is fixed.
- New tests fail on unchecked casts or structurally invalid payloads.

References:

- `packages/core/test/messages.test.ts:1`
- `packages/core/test/providers.test.ts:1`
- `packages/db/test/setup.ts:1`
- `apps/extension/vitest.config.ts:1`
- `packages/db/vitest.config.ts:1`
- `package.json:13`

## Recommended Execution Order

1. E1: Define Shared Effect Schema Boundaries.
2. E2: Tighten Chrome Runtime Message Contracts.
3. E3: Add Typed Chrome Transport Helpers.
4. E4: Validate Settings, API Keys, And Session Storage At Boundaries.
5. E8: Align Context Persistence With Privacy Docs.
6. E9: Fix Selected-Text Context Semantics.
7. E7: Add Persisted Record Schemas To Dexie Repositories.
8. E5: Move Provider Client And SSE Parsing To Typed Effect APIs.
9. E6: Refactor Chat Workflow Into An Effect Service.
10. E10: Keep React UI As A Consumer Of Typed Results.
11. E11: Repair Verification Setup And Add Migration Tests.

## Risks

- Overusing Effect in pure code would increase complexity without improving type safety.
- Tightening schemas may reveal existing invalid runtime messages that need migration adapters.
- Dexie validation on reads needs a policy for corrupted old records before automatic cleanup.
- Changing context snapshots requires a versioned migration if any users already have local data.
- Provider stream schemas must stay permissive enough to support OpenAI-compatible provider variations.

## Done When

- Runtime messages, provider responses, browser storage data, and Dexie records are decoded at boundaries.
- Expected failures are represented by typed errors.
- React receives typed results from service adapters.
- Full page context is not persisted in history by default.
- Selected text is focus plus full-page context, not selected-text-only context.
- Typecheck and tests pass.
