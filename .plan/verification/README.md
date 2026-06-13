# Verification Plan

## Objective

Verify the extension works across core runtime, storage, chat, and UI flows.

## Scope

- Unit tests.
- Component tests.
- Extension smoke tests.
- Manual QA checklist.

## Tasks

- [x] Add Vitest setup.
- [x] Add tests for sensitive-page policy.
- [x] Add tests for message schemas.
- [x] Add tests for storage usage estimation.
- [x] Add tests for retention policy.
- [x] Add tests for model catalog behavior.
- [x] Add tests for OpenRouter routed-model metadata.
- [x] Add tests for provider stream parsing.
- [x] Add React Testing Library setup.
- [x] Add side panel component tests.
- [x] Add options/onboarding component tests.
- [x] Add Playwright extension smoke test setup.
- [x] Add smoke test for toolbar opening side panel. Covered by manual checklist; Playwright documents the Chrome UI automation limitation.
- [x] Add smoke test for keyboard shortcut opening side panel. Covered by manual checklist; Playwright documents the Chrome UI automation limitation.
- [x] Add smoke test for keyboard shortcut quick action. Covered by manual checklist; Playwright documents the Chrome UI automation limitation.
- [x] Add smoke test for context extraction on normal page.
- [x] Add smoke test for blocked page state.
- [x] Add smoke test for streaming chat with mocked provider.
- [x] Add manual QA checklist.

## Done When

- `bun run check` passes.
- Unit tests pass.
- Component tests pass.
- Extension smoke tests load the built extension pages; Chrome UI-only paths are covered by the manual checklist and documented skip.
- Manual QA checklist is documented.
