# Product Features Implementation Plan

## Goal

Add product workflows on top of the core runtime and chat foundation.

## Dependencies

- Scaffold plan complete.
- Foundation plan complete.
- Extension runtime plan complete.
- Chat plan complete enough for normal streaming chat.

## Deliverables

- Side panel onboarding.
- Settings/options page.
- Quick actions.
- Keyboard shortcut actions.
- Selected-text floating button.
- Context-menu actions.
- AI suggestions stub.

## Tasks

### P1: Side Panel Onboarding

Status: complete

Steps:

- Detect missing provider setup.
- Show BYOK explanation.
- Let user choose OpenAI or OpenRouter.
- Accept API key input.
- Encrypt and store API key.
- Test provider connection.
- Let user choose default model.
- Request persistent storage if history is enabled.

Acceptance:

- New user can complete setup without leaving side panel.

### P2: Options Page Settings

Status: complete

Steps:

- Add provider key management.
- Add default provider/model selector.
- Add model visibility controls.
- Add favorites controls.
- Add context cap setting.
- Add history retention settings.
- Add storage usage display.
- Add excluded sites controls.
- Add AI suggestions toggle.

Acceptance:

- User can manage MVP settings after onboarding.

### P3: Model Picker

Status: complete

Steps:

- Load bundled model catalog.
- Apply hidden model settings.
- Sort favorites first.
- Show provider and model family.
- Mark unavailable models if needed.

Acceptance:

- Side panel model selector shows only enabled/visible models.

### P4: Side Panel Quick Actions

Status: complete

Steps:

- Add quick action UI.
- Add action IDs:
  - summarize
  - explain
  - explain-code
  - rewrite
  - translate
  - simplify
- Create visible user message for action.
- Send immediately through chat service.

Acceptance:

- Quick actions stream responses through the same chat pipeline.

### P5: Keyboard Shortcut Quick Actions

Status: complete

Steps:

- Add keyboard commands for default quick actions.
- Wire summarize current page shortcut.
- Wire explain selected text shortcut.
- Open side panel when a shortcut starts an action.
- Reuse side panel quick action pipeline.

Acceptance:

- Keyboard shortcuts behave like side panel quick actions.

### P6: Quick Action Prompt Templates

Status: complete

Steps:

- Add summarize template.
- Add explain article/text template.
- Add explain code template.
- Add rewrite selected text template.
- Add translate template.
- Add simplify template.

Acceptance:

- Each quick action has a distinct prompt path.

### P7: Selected-Text Floating Button

Status: complete

Steps:

- Show floating button near text selection.
- Hide on selection clear, scroll, or outside click.
- Open side panel on click.
- Pass selected text as focus.
- Request surrounding context.

Acceptance:

- User can select text and open Ask AI with that text as focus.

### P8: Context Menu Actions

Status: complete

Steps:

- Add context menu items.
- Wire selected-text context menu actions.
- Reuse side panel quick action pipeline.
- Open side panel when action starts.

Acceptance:

- Right-click actions behave like side panel quick actions.

### P9: AI Suggestions Stub

Status: complete

Steps:

- Add AI suggestions setting.
- Add placeholder UI area if useful.
- Ensure no provider call is made for suggestions yet.
- Add future disclosure copy placeholder.

Acceptance:

- Feature flag exists without adding runtime suggestion calls.

## Risks

- Too many feature entrypoints can obscure core chat bugs.
- Floating selection UI can conflict with page styles.

## Done When

- Onboarding and settings work.
- Side panel quick actions work.
- Keyboard shortcut quick actions work.
- Selected-text flow works.
- Context-menu actions reuse the same action pipeline.
