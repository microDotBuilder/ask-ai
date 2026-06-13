# Ask AI Storage And Database Decisions

This document records the current storage and database direction for Ask AI before detailed application architecture is finalized.

## Current Decisions

- V1 will use a normal Chrome extension architecture, not a native companion app.
- V1 will not create a visible SQLite file at a user path such as `~/askai/base/askai.db`.
- Whole chat threads will be stored locally in IndexedDB.
- Dexie is the preferred IndexedDB wrapper.
- OPFS is not needed for MVP.
- OPFS may be reconsidered later if Ask AI uses SQLite WASM, large file exports, binary attachments, or file-like local storage.
- `chrome.storage.local` will be used for small extension settings and encrypted API key records.
- IndexedDB will be used for conversations, messages, tab sessions, history metadata, and storage usage records.
- Full extracted page context will not be stored in history by default.
- Ask AI will track estimated storage usage with `storageBytes` on conversations and messages.
- Ask AI should request persistent browser storage when history is enabled.

## Storage Responsibilities

### `chrome.storage.local`

Use `chrome.storage.local` for small extension-level records:

- Provider settings.
- Selected default provider.
- Selected default model.
- Encrypted API key records.
- Feature flags.
- Smart suggestion setting.
- History enabled or disabled.
- Retention settings.
- Excluded sites for context.
- Excluded sites for history.

Do not use `chrome.storage.local` for full chat history. It has a much smaller default quota than IndexedDB and is not a good fit for large, searchable records.

### IndexedDB With Dexie

Use IndexedDB for structured app data:

- Conversations.
- Messages.
- Active tab sessions.
- History metadata.
- Storage accounting.
- Searchable conversation fields.

Dexie should be used to avoid raw IndexedDB complexity and to make schema versioning easier.

### OPFS

OPFS stands for Origin Private File System. It is browser-managed file-like storage. It does not create normal user-visible files at arbitrary paths on the computer.

OPFS is not part of the MVP storage plan.

Possible later uses:

- SQLite WASM database file.
- Large binary exports.
- Attachments.
- Local cache files.
- File-like workloads where IndexedDB is awkward.

### Native SQLite

A real SQLite database at a user path such as `~/askai/base/askai.db` requires a native companion app.

That would change the product from:

```txt
Chrome extension
```

to:

```txt
Chrome extension + installed native desktop app
```

The native app would communicate with the extension through Chrome Native Messaging.

This is not recommended for V1 because it adds installation complexity, packaging, platform differences, and a larger trust surface.

## Proposed Dexie Schema

### Conversations

```ts
type Conversation = {
  id: string
  tabSessionId: string
  url: string
  domain: string
  title: string
  provider: "openai" | "openrouter"
  model: string
  contextMode: "full-page"
  firstUserMessage: string
  messageCount: number
  storageBytes: number
  createdAt: string
  updatedAt: string
  retentionPinned: boolean
  deletedAt?: string
}
```

### Messages

Store chat threads as separate message rows, not as one giant JSON blob.

```ts
type Message = {
  id: string
  conversationId: string
  role: "user" | "assistant" | "system"
  content: string
  actionType?:
    | "summarize"
    | "explain"
    | "explain-code"
    | "rewrite"
    | "translate"
    | "simplify"
    | "custom"
  provider?: "openai" | "openrouter"
  model?: string
  tokenEstimate?: number
  storageBytes: number
  createdAt: string
  updatedAt: string
  error?: {
    type: string
    message: string
    retryable: boolean
  }
}
```

Benefits of separate message rows:

- Easier to append during streaming.
- Easier to update assistant responses while chunks arrive.
- Easier deletion and pruning.
- Easier storage accounting.
- Easier search later.
- Lower risk than constantly rewriting one large conversation blob.

### Tab Sessions

```ts
type TabSession = {
  id: string
  tabId: number
  url: string
  title: string
  activeConversationId?: string
  draftPrompt: string
  selectedText?: string
  pastedText?: string
  contextMode: "full-page"
  panelOpen: boolean
  createdAt: string
  updatedAt: string
}
```

### Context Metadata

Full page context is used for requests in V1, but the extracted page text should not be stored in history by default.

Store metadata instead:

```ts
type ContextSnapshot = {
  id: string
  conversationId: string
  mode: "full-page"
  pageTitle: string
  url: string
  domain: string
  extractedAt: string
  contextCharCount: number
  contextTokenEstimate: number
  contextHash: string
}
```

Do not store:

- Full extracted page text.
- Hidden page context excerpts.
- Sensitive page content.

Store only what the user actually sent as chat messages and what the assistant returned.

## Streaming Storage Behavior

Provider responses will stream.

Recommended behavior:

1. Create the user message.
2. Create an empty assistant message.
3. Stream provider chunks into memory.
4. Flush assistant message updates to IndexedDB every 500ms or on meaningful chunk batches.
5. On completion, write the final assistant message, final token estimate, and final `storageBytes`.
6. On cancellation or provider error, keep the partial assistant message and attach an error record.

This avoids writing to IndexedDB on every token while still protecting against losing the whole response if the panel closes or crashes.

## Storage Usage Accounting

Each stored record should estimate its own size.

```ts
function estimateStorageBytes(value: unknown): number {
  return new Blob([JSON.stringify(value)]).size
}
```

Store size at both levels:

```txt
message.storageBytes
conversation.storageBytes
```

The conversation value should include conversation metadata plus the sum of its messages and related metadata.

Settings should show:

```txt
History storage used
Conversation count
Retention policy
Persistent storage status
```

Example:

```txt
History storage used: 42.8 MB
Conversations: 137
Retention: 90 days or 100 MB
Persistent storage: Enabled
```

## Retention Policy

Recommended default:

- Keep up to 250 conversations.
- Keep up to 100 MB of local history.
- Keep history for 90 days by default.
- Prune oldest unpinned conversations first.

Ask AI should enforce whichever limit is reached first.

Users should be able to:

- Clear all history.
- Delete one conversation.
- Pin or preserve important conversations.
- Change retention duration.
- Disable history.
- View current storage usage.

## Persistent Browser Storage

Ask AI should request persistent storage when local history is enabled.

```ts
async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) {
    return false
  }

  if (await navigator.storage.persisted()) {
    return true
  }

  return navigator.storage.persist()
}
```

Ask AI can estimate browser-managed storage usage and quota:

```ts
async function getStorageEstimate() {
  if (!navigator.storage?.estimate) {
    return null
  }

  return navigator.storage.estimate()
}
```

Persistent storage does not make data permanent forever. Users can still clear extension or browser storage. It only reduces the chance that Chrome evicts Ask AI data automatically under storage pressure.

## Sensitive Content Rules

Sensitive pages should not produce stored page context.

For blocked sensitive pages:

- Do not extract context.
- Do not run chat.
- Do not run quick actions.
- Do not run AI suggestions.
- Show a disabled-state message in the side panel.

Suggested copy:

```txt
Ask AI is disabled on this page because it may contain sensitive information.
```

History should also avoid storing hidden page context. This means a conversation record may store the URL/title and messages, but not the extracted full page text.

## Prompt Context And History Context

The current prompt context should include:

```txt
Current user message
Current tab full page context
Current tab active conversation messages
Selected or pasted focus, when available
```

The current prompt context should not automatically include:

```txt
All previous conversations for the same URL
All history for the same domain
Other tab conversations
```

When the user opens recent conversation/history inside a tab, it should show history relevant to that tab/session by default. Broader URL-grouped history can exist in the history screen, but it should not automatically bloat the active model context.

## Open Questions

- Should users be allowed to opt into saving full page context with history?
- Should retention default be 90 days, 100 MB, or both?
- Should pinned conversations ignore all retention limits or only time-based cleanup?
- Should the app store token estimates from the provider response when available, or only local estimates?
- Should encrypted API key records require a user passphrase, or is local Web Crypto encryption enough for V1?
- Should Ask AI request persistent storage during onboarding or only when the user enables history?
