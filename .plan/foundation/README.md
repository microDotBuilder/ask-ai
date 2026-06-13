# Foundation Plan

## Objective

Build the shared foundation used by the extension runtime and UI.

## Scope

- Shared domain types.
- Effect Schema message contracts.
- Dexie database schema.
- Settings storage.
- API key encryption.
- Model catalog structure.
- OpenRouter routed-model metadata for Anthropic and Gemini models.
- Storage usage helpers.

## Tasks

- [x] Define shared provider/model/settings types for direct OpenAI and OpenRouter.
- [x] Add Effect Schema message contracts.
- [x] Add message parsing helpers.
- [x] Add Dexie database schema.
- [ ] Add database repositories:
  - [x] conversations
  - [x] messages
  - [x] tab sessions
  - [x] context metrics
- [x] Add storage usage estimation helper.
- [x] Add retention policy helpers.
- [x] Add persistent storage request/status helper.
- [x] Add Web Crypto AES-GCM API key encryption helpers.
- [x] Add encrypted API key record schema.
- [x] Add bundled model catalog structure.
- [x] Add routed model metadata for OpenRouter Anthropic/Gemini entries.
- [x] Add placeholder `scripts/refresh-model-catalog.ts`.

## Done When

- Shared schemas compile.
- Dexie database can initialize.
- Settings can be read/written.
- API key encryption/decryption works locally.
- Model catalog can return bundled models.
