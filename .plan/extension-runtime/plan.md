# Extension Runtime Implementation Plan

## Goal

Connect the Chrome extension runtime pieces so the side panel can open for the active tab and request page context.

## Dependencies

- Scaffold plan complete.
- Foundation message contracts available.

## Deliverables

- Toolbar click opens side panel.
- Keyboard commands can open side panel and dispatch default quick actions.
- Background coordinates tab session metadata.
- Content script extracts page context.
- Blocked/unsupported page states are returned consistently.

## Tasks

### R1: Chrome Message Transport

Status: completed

Steps:

- Add typed send-message helper.
- Add typed message listener helper.
- Validate incoming messages with Effect Schema.
- Normalize Chrome runtime errors.

Acceptance:

- Side panel/background/content can exchange typed messages safely.

### R2: Side Panel Open Flow

Status: completed

Steps:

- Add toolbar click handler in background.
- Add keyboard command handler in background.
- Use Chrome Side Panel API to open side panel for active tab.
- Create/update tab session metadata.
- Add placeholder side panel open confirmation.

Acceptance:

- Clicking extension icon or the open command opens the side panel for current tab.

### R3: URL-Level Policy

Status: completed

Steps:

- Implement URL policy checks:
  - browser internal pages
  - Chrome Web Store
  - PDFs
  - user-excluded sites
- Return blocked/unsupported reasons.

Acceptance:

- Background can classify blocked URLs before context extraction.

### R4: Content Script Context Request

Status: completed

Steps:

- Add content script listener for `PAGE_CONTEXT_REQUEST`.
- Return page title, URL, domain, and extracted text.
- Return extraction metrics.
- Return failure reason when extraction fails.

Acceptance:

- Side panel can request and receive page context on normal webpages.

### R5: DOM-Level Sensitive Policy

Status: completed

Steps:

- Detect password inputs.
- Detect common payment/card fields.
- Detect high-confidence auth/billing/account indicators.
- Return `sensitive-page` when blocked.

Acceptance:

- Sensitive pages block context extraction and chat.

### R6: Structured Page Extraction

Status: completed

Steps:

- Extract visible text.
- Preserve headings.
- Preserve paragraphs.
- Preserve lists.
- Preserve code blocks.
- Preserve reasonable table text.
- Apply context cap and truncation marker.

Acceptance:

- Extracted context is more useful than raw `document.body.innerText`.

### R7: Selection Detection

Status: completed

Steps:

- Detect current selected text.
- Emit selection changed message.
- Store selection focus in tab session state.
- Defer floating button UI until product-features phase if needed.

Acceptance:

- Selected text can be passed to side panel flows.

### R8: Side Panel Context Status

Status: completed

Steps:

- Show loading state while context is requested.
- Show available context status.
- Show unsupported page state.
- Show sensitive page disabled state.
- Show extraction failure state.

Acceptance:

- User can see whether Ask AI has page context.

### R9: Quick Action Command Routing

Status: completed

Steps:

- Define command IDs for default quick actions.
- Map summarize command to quick action trigger message.
- Map explain-selected command to quick action trigger message.
- Open side panel before dispatching command-triggered quick action.

Acceptance:

- Keyboard shortcut actions can enter the same pipeline as UI quick actions.

## Risks

- Chrome side panel behavior may require WXT-specific entrypoint adjustments.
- Some pages block content scripts or return incomplete DOM text.

## Done When

- Toolbar flow opens side panel.
- Side panel requests page context.
- Normal pages return structured text.
- Blocked pages show correct disabled/unavailable UI.
