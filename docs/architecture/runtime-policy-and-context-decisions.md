# Ask AI Runtime, Policy, And Context Decisions

This document records the current decisions for extension runtime messaging, page context extraction, sensitive-page blocking, PDF support, and API key storage.

## Current Decisions

- Chrome extension runtime messages will use explicit message contracts.
- Message contracts will be defined with Effect Schema for runtime validation and TypeScript inference.
- Sensitive pages will block context extraction, chat, quick actions, and AI suggestions.
- PDFs are not supported in MVP.
- V1 context extraction will use structured full-page webpage text.
- Smart context is deferred because it requires retrieval/RAG-style context selection and is a later paid-feature candidate.
- Selected text will be treated as the focus.
- When selected text exists, Ask AI will include selected text plus nearby surrounding page text.
- Ask AI will track extracted page sizes during alpha to guide future context limits.
- API keys will be encrypted with Web Crypto AES-GCM and stored locally in browser extension storage.
- API key passphrases are not required in MVP.
- OS keychain or password-manager storage is not part of MVP.

## Message Contracts

Chrome extension parts run in separate contexts:

- Background service worker.
- Content script.
- Side panel app.
- Options app.

These contexts cannot call each other like normal functions. They communicate by sending messages through Chrome extension APIs.

A message contract is the agreed shape of one of those messages.

Example request:

```ts
{
  type: "PAGE_CONTEXT_REQUEST",
  tabId: 123
}
```

Example response:

```ts
{
  type: "PAGE_CONTEXT_RESPONSE",
  ok: true,
  title: "Some Article",
  url: "https://example.com/article",
  text: "Full page text..."
}
```

Message contracts should use Effect Schema so that incoming messages are validated at runtime and inferred as TypeScript types.

Recommended contracts:

- Open side panel for current tab.
- Get selected text.
- Get full page context.
- Return full page context.
- Report blocked or sensitive page.
- Report context extraction failure.
- Trigger quick action.
- Report tab session changed.

Example schema style:

```ts
import { Schema } from "effect"

export const PageContextRequest = Schema.Struct({
  type: Schema.Literal("PAGE_CONTEXT_REQUEST"),
  tabId: Schema.Number,
})

export type PageContextRequest = Schema.Schema.Type<
  typeof PageContextRequest
>

export const PageContextResponse = Schema.Union(
  Schema.Struct({
    type: Schema.Literal("PAGE_CONTEXT_RESPONSE"),
    ok: Schema.Literal(true),
    title: Schema.String,
    url: Schema.String,
    domain: Schema.String,
    text: Schema.String,
    contextCharCount: Schema.Number,
    contextTokenEstimate: Schema.Number,
    contextTruncated: Schema.Boolean,
  }),
  Schema.Struct({
    type: Schema.Literal("PAGE_CONTEXT_RESPONSE"),
    ok: Schema.Literal(false),
    reason: Schema.Literal(
      "sensitive-page",
      "unsupported-page",
      "protected-page",
      "extraction-failed"
    ),
    message: Schema.String,
  })
)
```

## Sensitive-Page Policy

Sensitive pages should not be read or sent to AI providers.

For sensitive pages:

- Do not extract page context.
- Do not run chat.
- Do not run quick actions.
- Do not run AI suggestions.
- Show a disabled-state message in the side panel.

Suggested UI copy:

```txt
Ask AI is disabled on this page because it may contain sensitive information.
```

Initial blocking rules:

- Block browser-internal pages such as `chrome://`, `chrome-extension://`, `edge://`, and `about:`.
- Block Chrome Web Store and pages where content scripts are not allowed.
- Block pages with password inputs.
- Block pages with credit card or payment fields.
- Block user-excluded sites.
- Block pages that strongly appear to be auth, checkout, billing, banking, medical, or account settings pages.

Sensitive-page checks can come from two places:

- URL and permission checks in the background service worker.
- DOM signal checks in the content script.

If either layer marks the page sensitive, the side panel should show the disabled state.

## PDF Support

PDF pages are not supported in MVP.

MVP behavior:

- Do not extract PDF text.
- Do not run chat against PDF page context.
- Show a clear unsupported-page message.
- Allow the user to manually copy/paste PDF text into Ask AI.

Suggested UI copy:

```txt
PDF pages are not supported yet. Copy and paste text here to ask about it.
```

Reason:

PDF extraction in Chrome is different from normal webpage extraction and can require a separate parsing path such as PDF.js. It should not block the first working webpage assistant.

## Context Extraction

V1 uses full-page context for normal webpages.

Smart context is deferred because useful smart context requires a retrieval/RAG layer, ranking, and stronger evaluation than the first full-page implementation needs.

### Normal Page Context

Ask AI should extract visible webpage text from the active tab.

The extracted text should preserve practical structure where possible:

- Page title.
- Headings.
- Paragraphs.
- Lists.
- Code blocks.
- Table text where reasonable.

The output can be lightweight markdown-like text.

Example:

````md
# Page heading

Paragraph text...

## Section heading

- list item
- list item

```js
const example = true
```
````

Avoid relying only on raw `document.body.innerText` if a simple structured extractor can preserve useful headings and code blocks.

### Selected Text Context

Selected text is the focus.

When selected text exists, Ask AI should include:

- The selected text.
- Nearby surrounding page text.
- The structured full-page text, subject to the context cap.

The selected text should not be lost during truncation.

### Context Truncation

Even with full-page context, Ask AI needs a context cap because model limits and user cost vary.

For MVP:

- Use a generous cap.
- Prioritize selected text when present.
- Include structured full-page text up to the cap.
- Add a visible marker when truncation happens.

Suggested truncation marker:

```txt
[Page context truncated because it exceeded the configured context limit.]
```

Do not over-optimize truncation before alpha usage data exists.

### Alpha Context Metrics

Ask AI should measure extracted page sizes during alpha so context behavior can be improved with real data.

Track:

- `contextCharCount`.
- `contextTokenEstimate`.
- `contextTruncated`.
- `contextStorageBytes`.
- `domain`.
- `pageTypeGuess`.
- `createdAt`.

These metrics help answer:

- How often pages exceed the cap.
- Which sites commonly exceed the cap.
- Whether selected-text workflows need less context.
- Which model/provider limits are actually hit.

Do not store full extracted page text in history by default.

## Unreachable Or Protected Pages

If Ask AI cannot access a page, the side panel should show a disabled or unavailable state instead of failing silently.

Examples:

- Browser-internal pages.
- Pages where content scripts are blocked.
- PDF pages.
- Sensitive pages.
- User-excluded sites.

For unsupported or protected pages, Ask AI should not use page context. It may still allow a general chat or manually pasted text if the page is not sensitive.

Suggested generic copy:

```txt
Ask AI cannot access this page. You can paste text manually to ask about it.
```

For sensitive pages, use stronger copy and disable chat, quick actions, and AI suggestions:

```txt
Ask AI is disabled on this page because it may contain sensitive information.
```

## API Key Storage

API keys will be encrypted and stored locally in the browser.

MVP decisions:

- Use Web Crypto.
- Use AES-GCM encryption.
- Store encrypted key records in `chrome.storage.local`.
- Do not require a user passphrase.
- Decrypt keys only locally when sending a request to the selected provider.

Recommended product copy:

```txt
Your API keys are encrypted and stored locally in your browser. They are only decrypted on your device when Ask AI sends a request to your selected provider.
```

### Why Not bcrypt

bcrypt is for password hashing. It is not encryption.

Ask AI needs to decrypt the provider API key before sending a request. Because bcrypt is one-way, it cannot be used to store API keys that must later be decrypted.

### Why Not Chrome Password Manager

Chrome Password Manager and the Credential Management API are designed for website sign-in credentials. They are not a clean extension-level vault for arbitrary provider API keys.

Ask AI should not claim that API keys are stored in Chrome Password Manager.

### Why Not OS Keychain In MVP

OS keychain storage requires a native companion app.

Examples:

- macOS Keychain.
- Windows Credential Manager.
- Linux Secret Service.

A native companion would communicate with the extension through Chrome Native Messaging. This is possible later, but it adds installation complexity, platform packaging, and a larger trust surface.

### Future Security Options

Future options:

- Optional passphrase lock.
- Native companion app with OS keychain integration.
- Import/export encrypted backup.

## Open Questions

- What exact context cap should MVP use?
- Should context cap be configured by tokens, characters, or model-specific estimated tokens?
- What exact URL patterns should be included in the first sensitive-page blocklist?
- Should alpha context metrics be visible only in settings or also exportable for debugging?
- Should API key encryption metadata live in `chrome.storage.local` beside encrypted key records, or in IndexedDB with other app data?
