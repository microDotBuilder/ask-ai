# Verification Implementation Plan

## Goal

Build confidence that the extension works across runtime, storage, provider, context, and UI flows.

## Dependencies

- Scaffold plan complete.
- Feature areas implemented enough to test.

## Deliverables

- Unit test setup.
- Component test setup.
- Playwright extension smoke tests.
- Manual QA checklist.

## Tasks

### V1: Test Tooling

Status: complete

Steps:

- Configure Vitest.
- Configure React Testing Library.
- Configure Playwright for Chromium extension loading.
- Add test scripts to root package.

Acceptance:

- `bun run test` can execute test suites.

### V2: Core Unit Tests

Status: complete

Steps:

- Test message schema validation.
- Test sensitive-page policy.
- Test context cap and truncation helpers.
- Test storage usage estimation.
- Test retention policy.
- Test model catalog helpers.
- Test OpenRouter routed-model metadata.
- Test encrypted API key record validation.

Acceptance:

- Core behavior is covered without needing Chrome APIs.

### V3: Provider Tests

Status: complete

Steps:

- Test OpenAI-compatible stream parser.
- Test provider error mapping.
- Test model-not-found handling.
- Test cancellation path.

Acceptance:

- Provider client behavior is deterministic with mocked streams.

### V4: Database Tests

Status: complete

Steps:

- Test conversation creation.
- Test message append/update.
- Test streaming message flush behavior.
- Test tab session restore.
- Test context metrics writes.
- Test retention pruning.

Acceptance:

- Dexie behavior works in a test environment.

### V5: Component Tests

Status: complete

Steps:

- Test onboarding flow states.
- Test chat input behavior.
- Test streaming response rendering.
- Test context status UI.
- Test model picker filtering/favorites.
- Test settings controls.

Acceptance:

- Main UI states render correctly without full extension runtime.

### V6: Playwright Extension Smoke Tests

Status: complete

Steps:

- Load built extension in Chromium.
- Test toolbar opens side panel.
- Test keyboard shortcut opens side panel.
- Test keyboard shortcut quick action routing.
- Test normal page context extraction.
- Test blocked page UI.
- Test mocked streaming chat.
- Test selected-text entrypoint when implemented.

Acceptance:

- Main happy path and blocked path are covered in browser.

### V7: Manual QA Checklist

Status: complete

Steps:

- Add checklist for install/load.
- Add checklist for onboarding.
- Add checklist for OpenAI key setup.
- Add checklist for OpenRouter key setup.
- Add checklist for toolbar chat.
- Add checklist for keyboard shortcut quick actions.
- Add checklist for selected text.
- Add checklist for quick actions.
- Add checklist for sensitive/unsupported pages.
- Add checklist for history and storage settings.

Acceptance:

- Manual release testing can follow a written checklist.

## Risks

- Playwright extension side panel automation may require custom setup.
- Some Chrome APIs may need manual verification even with tests.
- Toolbar, keyboard shortcut, and selected-text browser UI paths are documented manual checks because Playwright cannot reliably drive all Chrome extension UI surfaces from this harness.

## Done When

- Core tests pass.
- Component tests pass.
- Extension smoke tests pass or documented limitations exist.
- Manual QA checklist is available.
