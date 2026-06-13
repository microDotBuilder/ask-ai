# Plan — Chat history drawer with fuzzy search

## Goal

Let users browse, search, and reopen prior conversations from the side panel without leaving the chat. The history view must keep tab/page context visible so each thread reads like "this is what you asked while on globalnews.ca."

## Constraints

- Dark theme only.
- Side panel is narrow (~360–400px). No permanent extra column or vertical strip.
- `session == tab == thread` architecture stays: opening an old thread rebinds the current tab's `tabSession.conversationId` to that conversation. (See `[[askai-tab-scoped-sessions]]`.)
- Incremental change, not a rewrite. Match existing component conventions in `apps/extension/src/ui/`.
- Append-only message semantics stay intact — opening a past conversation just restores it; it does not branch or delete anything.

## UX

A `History` clock-icon button is added to `HeaderActions`, between Settings and New-chat. Tapping it slides a drawer down over the chat area:

```
+---------------------------------------+
|  [search input "Search conversations"]|
|---------------------------------------|
|  ON THIS PAGE (globalnews.ca)         |
|  [favicon] Article title              |
|           "Summarize the page..."     |
|           2h ago                      |
|---------------------------------------|
|  OTHER CONVERSATIONS                  |
|  [favicon] Other page                 |
|           "What is X?"                |
|           yesterday                   |
|  ...                                  |
+---------------------------------------+
```

- 200ms ease-out slide-down + 150ms backdrop fade. Backdrop dims the chat but does not blur it.
- Dismiss: Esc, tap backdrop, tap the History icon again, or pick a row.
- Search input auto-focuses on open. Live filter as the user types.
- Empty state (no conversations yet): "No saved conversations yet — start chatting and they'll appear here."
- Empty state (filter no match): "No matches for \"foo\"."

### Grouping rule (confirmed)

- **On this page** = `conversation.sourceUrl`'s domain matches the current tab's domain. The group header shows the domain.
- **Other conversations** = everything else, sorted by `lastMessageAt` desc.
- If there's no current tab domain (e.g., context still loading), skip the "On this page" group and just show "All conversations."

### Search scope (confirmed)

Fuzzy match against:
- `conversation.title` (already derived from first user prompt — see `titleFromQuestion` in `chat.ts:84`)
- `conversation.sourceUrl`'s domain
- The first user message of each conversation (1 DB read per conversation, batched at drawer open)

Library: `fuse.js` (~6kb gzipped). Build the Fuse index once when the drawer opens, throw it away on close. Keys + weights: `title (0.6)`, `firstUserMessage (0.3)`, `domain (0.1)`.

### Row interaction

- Tap row → drawer closes (instant), conversation loads in place. The current tab's `tabSession` rebinds its `conversationId` to the picked conversation. Subsequent messages in this tab continue that thread.
- No swipe-to-delete in v1 — deletion is out of scope (a follow-up could add a long-press menu or a "manage" mode).

## Data model — already in place

- `conversations` table indexes: `id, updatedAt, createdAt, lastMessageAt, status, pinned, sourceUrl` — `lastMessageAt` index supports the sort directly.
- `conversationRepository.list({ includeArchived })` exists at `packages/db/src/repositories/index.ts:38`. Returns sorted by `updatedAt` desc — fine for v1; switch to `lastMessageAt` if ordering looks off in practice.
- `messageRepository.listByConversation(id)` exists for fetching the first user message per conversation.
- No schema changes required.

## Implementation steps

### Step 1 — dependency + helper

- Add `fuse.js` to `apps/extension/package.json`.
- New `apps/extension/src/sidepanel/history.ts`:
  - `loadHistoryEntries(currentDomain: string | undefined): Promise<HistoryEntry[]>`
  - `HistoryEntry` = `{ id, title, domain, firstUserMessage, sourceUrl, lastMessageAt, isCurrentDomain }`
  - Fetches all active conversations, then in parallel grabs the first user message for each via `messages.where({ conversationId }).filter(role === 'user').first()` (cap at e.g. 100 conversations in v1; log if more).
  - `restoreConversationById(tabId: number, conversationId: string): Promise<RestoredConversation>` — counterpart to `restoreActiveConversation`. Updates the tab session to point at `conversationId`, then returns `{ conversation, messages }` like `restoreActiveConversation` does.

### Step 2 — store wiring

In `apps/extension/store/sidepanelstore.ts`:

- New state:
  - `historyOpen: boolean`
  - `historyEntries: HistoryEntry[] | null` (null = not loaded)
  - `historyQuery: string`
- New actions:
  - `openHistory()` — sets `historyOpen: true`, loads entries if `null`.
  - `closeHistory()`
  - `setHistoryQuery(q: string)`
  - `openConversation(conversationId: string)` — calls `restoreConversationById(tabId, conversationId)`, sets `conversation` + `messages`, closes drawer.

### Step 3 — UI

- `apps/extension/src/ui/historyDrawer.tsx` (new):
  - Renders `null` if `!historyOpen`.
  - Renders a fixed-position drawer + backdrop.
  - Builds Fuse index from `historyEntries` on mount and when entries change.
  - Filters with Fuse when `historyQuery` non-empty; otherwise shows all entries.
  - Groups by `isCurrentDomain`.
  - Esc key closes; backdrop click closes.
- `apps/extension/src/ui/headerAction.tsx`:
  - Add `History` icon button (lucide-react `History` or `Clock`), wired to `openHistory()`.
- `apps/extension/entrypoints/sidepanel/App.tsx`:
  - Render `<HistoryDrawer />` inside `.sidepanel-shell` after `<main>` content.
  - Pass `currentDomain` derived from `contextSummary?.domain`.

### Step 4 — styles

`apps/extension/entrypoints/sidepanel/styles.css`:

- `.history-drawer-backdrop` — fixed, full panel, `background: rgba(0,0,0,0.5)`, 150ms fade.
- `.history-drawer` — fixed, top: 0, left: 0, right: 0, `max-height: 80vh`, `transform: translateY(-100%) → 0`, 200ms ease-out.
- `.history-search` — Inter, padding, focus ring matches existing inputs.
- `.history-group-label` — Roboto Mono, uppercase, micro-label style (matches existing `YOU` / `ASSISTANT` chips).
- `.history-row` — favicon (16px) left, title + first-prompt-preview + time stacked right. `cursor: pointer`. Subtle hover background.
- `.history-empty` — centered helper text.

Favicons: use `chrome://favicon/size/16@1x/<url>` if available; otherwise fall back to a generic `Globe` lucide icon to avoid network calls. (Worth testing — manifest v3 may restrict `chrome://favicon`. If so, fallback only.)

## Files touched (summary)

- `apps/extension/package.json` — add `fuse.js`
- `apps/extension/src/sidepanel/history.ts` — new helper
- `apps/extension/src/sidepanel/chat.ts` — export `restoreConversationById` (small addition)
- `apps/extension/store/sidepanelstore.ts` — drawer state + actions
- `apps/extension/src/ui/historyDrawer.tsx` — new component
- `apps/extension/src/ui/headerAction.tsx` — add icon button
- `apps/extension/entrypoints/sidepanel/App.tsx` — mount drawer
- `apps/extension/entrypoints/sidepanel/styles.css` — drawer + row + search styles

## Risks / open questions

- **Favicon availability under MV3**: confirm before relying on `chrome://favicon`. Fallback path is safe regardless.
- **Large histories**: v1 caps at 100 conversations loaded into the Fuse index. Above that, paginate or move search server-side (here: into a Dexie query). Defer until users hit it.
- **First-user-message fetch cost**: 100 conversations × 1 message lookup each runs in parallel via Dexie — should be fast (sub-100ms on a warm DB) but worth profiling on a real history. If slow, denormalize a `firstUserMessageSnippet` onto `ConversationRecord` later.
- **Switching mid-stream**: `openConversation` should be disabled or no-op while `isStreaming === true`, same guard as `startFreshChat`.
- **Pinning**: schema already has `conversation.pinned`. v1 doesn't surface it. A natural follow-up is a pin star on each row and a "Pinned" group at the very top.

## Out of scope for v1

- Deleting conversations from the drawer.
- Pinning UI.
- Bulk operations (clear all, export).
- Cross-device sync.
- Searching inside message bodies (deferred per user choice).
