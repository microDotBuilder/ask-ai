# Extension Runtime Plan

## Objective

Wire the Chrome extension runtime pieces together.

## Scope

- Toolbar click.
- Keyboard command handling.
- Side panel open behavior.
- Background service worker coordination.
- Content script context extraction request/response.
- Blocked and unsupported page handling.
- Tab session metadata.

## Tasks

- [x] Add toolbar click handler.
- [x] Add keyboard command handler.
- [x] Open side panel for active tab.
- [x] Add tab session creation/update flow.
- [x] Add URL-level sensitive-page checks.
- [x] Add content script message listener.
- [x] Add page context request/response flow.
- [x] Add protected/unsupported page responses.
- [x] Add PDF unsupported response.
- [x] Add user-excluded site check.
- [x] Add side panel context status states.

## Done When

- Clicking toolbar opens the side panel.
- Side panel can request page context.
- Content script returns page metadata and text for normal pages.
- Blocked pages show a disabled/unavailable state.
- PDF pages show unsupported copy.
