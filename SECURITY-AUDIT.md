# Ask AI — Security Audit & Remediation Plan

**Target:** `ask-ai` Chrome MV3 extension (this repo, `main` branch)
**Date:** 2026-06-13
**Scope:** Full implementation under `apps/extension` and `packages/*/src` (build output in `dist/`/`.output` and the planning docs were excluded as non–ground-truth).
**Method:** Multi-agent audit — 13 independent dimensions each *found* issues against the real code, then an *adversarial verifier* re-read the code to confirm/refute/re-score every candidate. 80 candidates → **78 verified** (77 confirmed, 1 uncertain), 2 refuted as false positives. This document consolidates them into ~30 distinct issues.

> This is an **audit + plan only**. No source files were changed.

---

## Executive Summary

The extension is **architecturally sound and free of the worst classic extension bugs**: there is **no SSRF** (provider base URLs are hard-coded), **no DOM XSS** (LLM/markdown output is rendered through `react-markdown` with its default safe URL transform, no `dangerouslySetInnerHTML`), **no `externally_connectable`** (so web pages cannot message the extension directly today), and AES-GCM is used correctly (random 256-bit key, fresh random 12-byte IV per encryption, no IV reuse). Listener cleanup in the UI is generally correct.

The real risks are a cluster of **privacy / data-governance gaps where the code does not honor the product's own stated guarantees**, plus **missing trust-boundary checks** between the (untrusted) content script and the privileged background/side-panel. Specifically: the **"Save chat history" toggle is ignored** (chats are stored regardless), **retention/pruning never runs** and **there is no way to delete a conversation** (so data is effectively permanent), the **side panel never rebinds when you switch tabs** (one tab's conversation/page-context bleeds into another), the **sensitive-page check is cached and never re-evaluated before sending** (a page that becomes a login/checkout page after the check still gets sent to the LLM), and **runtime message handlers don't validate the sender** (a content script on any visited page can ask the background to extract the text of *another* tab).

**The single most important issue** is the combination of *"history is always persisted + retention never enforced + no delete UI"*: a user who opts out of history, or who simply expects old/sensitive chats to age out, instead accumulates every prompt and AI response permanently on disk with no remediation path.

No finding allows a **remote web page to steal the user's API key** — the key is never placed in the prompt, never sent to the content script, and only ever leaves as a `Bearer` header to the two hard-coded provider origins. The key-storage weakness (encryption key stored beside the ciphertext) and the absence of a `connect-src` CSP are real **defense-in-depth** gaps that matter only if the side-panel context is otherwise compromised.

---

## Severity & Category Breakdown

| Severity | Count (raw) | Consolidated themes |
|----------|-------------|---------------------|
| 🔴 High | 7 | 6 |
| 🟠 Medium | 21 | 12 |
| 🟡 Low | 42 | ~13 |
| ⚪ Info | 8 | 7 |
| **Total** | **78** | — |

By category: **security 14**, **privacy 20**, **logic-bug 21**, **correctness-bug 7**, **quality 11**, **info 5**.

> Note on severity: ratings are calibrated to *this* threat model (a local BYOK extension that reads pages and holds the user's own API key). Several issues are "high impact only if another layer is already compromised" and are scored as defense-in-depth accordingly.

---

## Top Risks (read these first)

1. **History persists even when "Save chat history" is off** — privacy promise silently broken (H2).
2. **Retention never runs + no delete path** — chat history & page metadata are effectively permanent (H3, H4).
3. **Side panel doesn't rebind on tab switch** — conversations and page context leak across tabs; streams keep billing the old tab (H5).
4. **Sensitive-page status is cached, not re-checked before send (TOCTOU)** — a page that turns into a login/checkout page after the initial scan still gets extracted and sent to the LLM (H6).
5. **Message handlers don't validate the sender / trust caller-supplied `tabId`** — a content script on any page can drive extraction of *another* tab (H1).
6. **Encryption key is stored next to the ciphertext, with no CSP `connect-src`** — at-rest "encryption" is obfuscation-grade, and a compromised panel could exfiltrate the key anywhere (M1, M6).

---

## What's Done Well (verified safe)

These were specifically checked and found **not** vulnerable — worth knowing so remediation effort isn't misdirected:

- **No SSRF / endpoint injection.** `resolveProviderRequestConfig` hard-codes `https://api.openai.com/v1` and `https://openrouter.ai/api/v1`; the API key only ever goes out as `Authorization: Bearer` to those origins (`packages/core/src/providers/index.ts:134-158`).
- **No DOM XSS in output rendering.** Assistant output is rendered via `react-markdown` (v10) with its default `defaultUrlTransform` (blocks `javascript:`/`data:` hrefs); no `dangerouslySetInnerHTML`/`innerHTML` anywhere in the app. Provider error bodies are rendered as escaped JSX text, not HTML (#43, #72).
- **No `externally_connectable`** in the manifest, so external web pages cannot reach `chrome.runtime.onMessage` directly today — the sender-validation gaps (H1) are currently exploitable only by the extension's *own* content script, not arbitrary sites.
- **Crypto primitives are correct** — random AES-256 key, per-message random 12-byte IV, GCM. The weakness is *where the key is stored*, not the algorithm (M1).
- **UI listener cleanup is correct** — `ModelSelector`/`RetryDropdown` outside-click listeners and the copy-timeout are all torn down on unmount; the retry control is disabled during streaming (#77).
- **API key is never in the model prompt** — indirect prompt injection (L7) can manipulate answers but cannot exfiltrate the key.

---

## 🔴 High-Severity Findings

### H1. Runtime message handlers don't validate the sender; `pageContextRequest` trusts a caller-supplied `tabId`
**Category:** security / privacy · **Confidence:** high · **Raw:** #1, #2, #42, #66
**Locations:** `apps/extension/src/chrome/index.ts:85-125` · `apps/extension/entrypoints/background.ts:369-372` (handler) + `251-288` (`requestPageContext`)

`addChromeMessageListener` validates only the message *shape* and passes the raw `MessageSender` through untouched. The background `pageContextRequest` handler then forwards `message.tabId` straight into `requestPageContext`, which does `chrome.tabs.get(tabId)` and extracts that tab's content — with **no `sender` check**. The content script is registered for `<all_urls>`, so it is a legitimate in-extension sender.

```ts
// background.ts
if (message.type === messageTypes.pageContextRequest) {
  return requestPageContext(message.tabId, message.mode); // message.tabId is attacker-chosen
}
```

**Impact:** A page the user merely visits can (via its injected content script) enumerate integer tab IDs and exfiltrate the readable text of the user's *other* open tabs (webmail, internal apps, docs), bounded only by the destination tab's own sensitivity heuristics. This directly contradicts the "reads only the current page" model. The same missing boundary lets a content script force the side panel open and inject a quick-action prompt (see M5).

**Fix:** Validate provenance at the boundary. For background/UI-only messages (`pageContextRequest`, `quickActionRequest`) require `sender.id === chrome.runtime.id && !sender.tab`. For content-script messages (`selectionChanged`) require `sender.tab` and use **`sender.tab.id` only**, never `message.tabId`. Reject everything else before invoking the handler.

---

### H2. `saveHistory` setting is never honored — chats are persisted even when history is disabled
**Category:** privacy · **Confidence:** high · **Raw:** #4
**Locations:** `apps/extension/src/sidepanel/chat.ts:157` (createConversation), `393`/`609` (message writes), `230`/`239` (context)

`SettingsSchema.saveHistory` (default `true`) is the user's "Save chat history" toggle. It is read in exactly two places (`sidepanelstore.ts:264`, `options/App.tsx:363`) and used **only** to decide whether to call `navigator.storage.persist()`. `streamChatImplementation`/`runStreaming` write user messages, assistant messages, the conversation, context snapshots, and metrics to Dexie **unconditionally**.

**Impact:** A user who turns **off** "Save chat history" still has every prompt and AI response written to IndexedDB. Combined with H3 + H4 (no pruning, no delete), that data is effectively permanent.

**Fix:** Read `settings.saveHistory` at the top of `streamChatImplementation` and skip all Dexie writes when `false` (keep the session in memory only); optionally purge existing rows when the user disables history.

---

### H3. Retention pruning is never invoked — history grows without bound
**Category:** privacy · **Confidence:** high · **Raw:** #5 (depends on #19, #49)
**Locations:** `packages/db/src/retention/index.ts:24-98` (implemented, never called)

`createRetentionPruningPlan` correctly implements age/count/storage pruning, but a repo-wide grep shows it is **called nowhere** outside its own tests. The background worker keeps tab sessions in an in-memory `Map` and never touches Dexie. No `chrome.alarms`, options action, or side-panel flow ever computes or applies a plan.

**Impact:** The configured limits (250 conversations / 100 MB / 90 days) are silently ignored. Sensitive prompts and AI responses accumulate forever. Two latent bugs would also break it once wired:
- **#19:** `conversation.storageBytes` is set once at creation and never re-aggregated from messages, so storage-based pruning would see a few hundred bytes per conversation instead of the real size — `maxStorageBytes` would essentially never trigger.
- **#49:** `AskAiSettings.retention` field names (`maxConversations`) don't match `RetentionPolicy` (`maxConversationCount`, `historyEnabled`); spreading the settings object would silently fall back to defaults.

**Fix:** Invoke `createRetentionPruningPlan` on a `chrome.alarms` schedule (and/or after each conversation write); map settings → policy **explicitly** (don't spread); aggregate `conversation.storageBytes` on each message flush (or compute retention storage from message sums).

---

### H4. No deletion path exists for conversations or messages
**Category:** privacy · **Confidence:** high · **Raw:** #6 (related #50)
**Locations:** `apps/extension/src/sidepanel/history.ts:35-64` (read-only consumer)

`conversationRepository.delete` (cascades to messages/snapshots/metrics), `messageRepository.delete`, and `contextRepository.deleteByConversation` are implemented and unit-tested but **called nowhere** in `apps/extension`. The history view is purely read-only. There is also no `chrome.tabs.onRemoved` handler, so `tabSessions` rows accumulate too (#50).

**Impact:** Users cannot remove a stored conversation. With H2 + H3, all chat data and page-context metadata is permanent and un-erasable from the UI.

**Fix:** Add "Delete conversation" and "Clear all history" actions that call `conversationRepository.delete(id)` (cascade) and remove associated `tabSessions`. Add an `onRemoved` listener to clean up closed-tab sessions.

---

### H5. Side panel never rebinds on tab switch → cross-tab conversation/context bleed (and double-billing)
**Category:** logic-bug / privacy · **Confidence:** high · **Raw:** #7, #21, #24, #27, #56
**Locations:** `apps/extension/entrypoints/sidepanel/App.tsx:50-58` (mount-only) · `apps/extension/store/sidepanelstore.ts:291-308` (`upsertMessage`), `403-452` (`sendPrompt`)

The Chrome side panel is **one persistent document per window**. `App.tsx` calls `refreshProductState()` once on mount and registers **no** `chrome.tabs.onActivated`/`onUpdated`/`visibilitychange` listener and **no** handler for the background's `tabSessionUpdated` broadcast. After switching tab A → B, the panel keeps showing A's chat and context banner, while store actions resolve the *current* tab lazily via `getActiveTabId()` at action time — so the displayed state and the action target diverge.

Compounding bugs in the same family:
- **#21:** `upsertMessage` matches messages by `id` only (no `conversationId`/`tabId` guard); an in-flight stream for tab A is never aborted on switch and can write A's tokens into B's loaded message list.
- **#24:** `sendPrompt` snapshots `contextState` *before* `await getActiveTabId()`, so context and resolved `tabId` can mismatch.
- **#56:** the `isStreaming` guard is checked before an `await`, then `abortController` is set after — a re-entrancy race can launch two concurrent provider requests (double BYOK billing) and orphan the first stream so the Stop button can't cancel it.

**Impact:** One tab's conversation, page content, and history snapshots can be attributed to, and mixed into, another tab. Streams keep consuming the user's API quota for a tab they've navigated away from.

**Fix:** Add `chrome.tabs.onActivated`/`onUpdated` listeners in the side panel that **abort the current stream**, reset conversation/messages/context/focus, and re-bind to the new tab. Capture the target `tabId` at action start (not lazily). Stamp `upsertMessage` updates with the `conversationId` captured at send time and drop stale ones. Set `isStreaming` synchronously / abort any existing controller before overwriting.

---

### H6. Sensitive-page status is cached and never re-checked before send (TOCTOU) — bypasses the "disabled on sensitive pages" policy
**Category:** privacy · **Confidence:** high · **Raw:** #3, #28
**Locations:** `apps/extension/store/sidepanelstore.ts:403-436` (`sendPrompt`), `426-436` (cached status)

Page sensitivity (and the page text itself) is decided **once** when `requestContext` runs, then frozen in `contextState`. `sendPrompt`/`retryMessage`/`editMessage` reuse that snapshot and gate only on `contextState.status === 'available'`; they never re-extract or re-classify. `requestContext` is triggered only on mount, on the manual Refresh button, and on quick-action receipt — there is no navigation/SPA listener.

**Impact:** A page that was safe at extraction time but **becomes sensitive afterward** — a login modal opens, an SPA routes to `/checkout`, a password field is injected — keeps `status: available`, and its now-sensitive content is sent to the third-party LLM. Every follow-up turn also re-sends the same frozen snapshot. This defeats the core "sensitive pages are fully disabled" guarantee whenever the page changes between check and send.

**Fix:** Re-request and re-classify context immediately before each send; refuse to send if the live tab id/URL differs from the snapshot. Re-run `detectSensitivePage` against the live DOM at send time (combine with the H5 navigation listeners).

---

## 🟠 Medium-Severity Findings

### M1. API-key encryption key is stored beside the ciphertext → obfuscation, not at-rest protection
**Category:** security · **Confidence:** high · **Raw:** #8, #68, #74 (enabler #29, robustness #30, dead type #71)
**Locations:** `packages/core/src/crypto/index.ts:46-50` (extractable key), `151-156` (`writeApiKeyEncryptionKey`) · `apps/extension/src/product/index.ts:92-108`

The raw 256-bit AES key is generated `extractable=true`, exported raw, and written to `chrome.storage.local["askai.apiKey.encryptionKey"]` — **the same readable store** that holds the ciphertext+IV (`askai.apiKey.<provider>`). Anyone who can read that store has both halves and trivially recovers the plaintext key.

```ts
await writeApiKeyEncryptionKey(chrome.storage.local, await exportApiKeyEncryptionKey(key)); // product/index.ts:100
await saveEncryptedApiKey(chrome.storage.local, encrypted);                                 // product/index.ts:107
```

**Impact:** Against an attacker with `chrome.storage.local` read access (profile/disk access, infostealer malware, another privileged extension), the AES-GCM layer adds nothing — the OpenAI/OpenRouter key is recoverable, enabling billing fraud. The product copy "your keys are encrypted and stored locally" over-states the protection. *(A content script or web page cannot read `chrome.storage.local`, which is why this is Medium, not High.)*

**Related:** key is `extractable` only to enable this co-located storage (#29); `ciphertext`/`iv` aren't validated as base64 so a corrupted record throws a mislabeled error (#30); a stale `EncryptedSecretRecord` type missing `iv` lingers on the public API (#71).

**Fix:** Don't co-locate the key with the ciphertext. Preferred: generate `extractable=false` and persist the `CryptoKey` object itself in IndexedDB (structured clone supports non-extractable keys) so raw bytes never touch JS/storage. Interim: store the key in `chrome.storage.session` (memory-only). For real at-rest protection, add an optional passphrase (PBKDF2/Argon2). Until then, correct the product copy. Validate base64 + 12-byte IV in the schema; delete the dead type.

### M2. Sensitive-DOM detection is blind to iframes and shadow DOM, and the content script is top-frame only
**Category:** privacy · **Confidence:** high · **Raw:** #9, #15, #16 · **Loc:** `apps/extension/src/content/extraction.ts:44-65`, `apps/extension/entrypoints/content.ts:119-121`

`detectSensitivePage` only queries the top `document` for `input[type=password]`/payment inputs, and the content script is registered without `all_frames`. Cross-origin payment/SSO iframes (Stripe Elements, PayPal hosted fields, embedded auth) and open shadow roots are invisible, so such pages classify as **safe** and their top-frame text is sent to the LLM. **Fix:** inject into `all_frames` and have child frames report sensitivity up (block the tab if *any* frame is sensitive), and/or treat known payment/SSO iframe origins as a block signal.

### M3. Sensitive-page heuristics are fragile/bypassable; no URL-level auth/banking/checkout blocking
**Category:** privacy/security · **Confidence:** high · **Raw:** #11, #64 · **Loc:** `apps/extension/src/content/extraction.ts:52-85`, `apps/extension/entrypoints/background.ts:76-155`

Payment/auth detection relies on **English** keyword regexes over field attributes + only the first **5000 chars** of body text, scanned **once**. Non-English pages, generic field names, late-rendered SPA content, or signals past 5000 chars slip through. `classifyUrl` blocks only browser-internal schemes, the Web Store, `.pdf`, and excluded sites — there is **no** URL-level auth/banking/checkout heuristic, so the documented URL layer of the policy is effectively unimplemented and everything rests on the one DOM heuristic. **Fix:** always block on structural signals (`input[type=password]`, `autocomplete^=cc-`) across frames/shadow; add conservative URL/host heuristics in `classifyUrl`; scan more than 5000 chars and re-run on mutation/navigation.

### M4. Selection text + exact URL/title are captured and retained from sensitive pages
**Category:** privacy · **Confidence:** high · **Raw:** #10, #65, #34 · **Loc:** `apps/extension/entrypoints/content.ts:5-18,135-138`, `apps/extension/entrypoints/background.ts:379-395`

An unconditional `selectionchange` listener sends selected text + `document.title` + `location.href` with **no** sensitivity gate; the background stores it in the in-memory `tabSessions` map. Highlighting text on a banking/auth page captures that selection + URL + title off the page. (Verified: this does **not** reach the provider or DB while the page stays sensitive — the send path re-gates on `status` — so it's Medium, in-memory only.) The `selectionChanged` handler also trusts caller-supplied `message.tabId/url/title`, letting a page poison another existing session's state (#34). **Fix:** gate selection emission/floating-button on `detectSensitivePage`; use `sender.tab.id`/`sender.tab.url` only.

### M5. Quick-action injection — a content script can open the panel and inject an attacker-controlled prompt
**Category:** security · **Confidence:** high · **Raw:** #12, #13, #22, #35 · **Loc:** `apps/extension/entrypoints/background.ts:374-377`, `apps/extension/entrypoints/sidepanel/App.tsx:60-76`

The background acts on `quickActionRequest` whenever `sender.tab` is truthy (any content script). `actionId` is validated only as `Schema.String` and `focus` is an arbitrary string; both flow into `buildQuickActionPrompt` (unknown ids fall back to `Help with this action: ${actionId}` + `Selected text:\n${focus}`). The side panel *also* accepts `quickActionRequest` from any in-extension sender without an origin check, and acts on broadcasts without matching `tabId`. **Impact:** a malicious page can force the panel open and queue an LLM request whose prompt text it controls, spending the user's BYOK quota. (Page context used is still the active tab's, so it's not by itself cross-tab data theft.) **Fix:** constrain `actionId` to the known literals; accept `quickActionRequest` only from the trusted background (`sender.id === chrome.runtime.id && !sender.tab`); don't accept it from content scripts at all.

### M6. No CSP / `connect-src` to constrain where a compromised panel could send the decrypted key
**Category:** security · **Confidence:** high · **Raw:** #14 · **Loc:** `apps/extension/wxt.config.ts:28-64`

The production manifest declares **no** `content_security_policy`, so it falls back to the MV3 default with **no `connect-src` restriction**. The side panel decrypts the BYOK key and `fetch`es with it. **Impact:** if the panel context is ever compromised (dependency/supply-chain, a future XSS), the decrypted key can be exfiltrated to **any** host. **Fix:** add `content_security_policy.extension_pages` with `connect-src 'self' https://api.openai.com https://openrouter.ai; script-src 'self'; object-src 'self'; base-uri 'none'; frame-ancestors 'none'` so outbound requests are bounded to the providers.

### M7. URL scheme blocklist omits `file:`, `view-source:`, `data:`, `blob:`
**Category:** privacy · **Confidence:** medium · **Raw:** #17 · **Loc:** `apps/extension/entrypoints/background.ts:114-123`

`classifyUrl` blocks only `chrome:`/`chrome-extension:`/`edge:`/`about:`/`devtools:`. With `<all_urls>`, extraction can run on `file://` (private on-disk documents), `view-source:`, `data:`, `blob:`. **Fix:** allowlist `http:`/`https:` only.

### M8. Context token cap only bounds the page envelope — history + question are uncounted
**Category:** logic-bug · **Confidence:** high · **Raw:** #18 · **Loc:** `packages/core/src/prompts/index.ts:67-83`

`buildPageAwarePrompt` applies `contextTokenCap` only to the page-context envelope. The system prompt, the **full** (unbounded, growing) conversation history, and the user question are concatenated with no budget. **Impact:** long conversations exceed the model context window → provider `400 context length exceeded` errors surface as failed messages; cost is effectively unbounded despite the user-set "cap". **Fix:** budget the whole message array (subtract system+question, then trim/drop oldest history pairs); clarify the UI label.

### M9. `conversation.storageBytes` is never aggregated (breaks storage-based retention)
See **H3** — folded into the retention fix. Raw #19. `apps/extension/src/sidepanel/chat.ts:157,469-472`.

### M10. No DB migration framework; `schemaVersion` frozen at `1` with an empty migrations module
**Category:** correctness-bug · **Confidence:** high · **Raw:** #20 · **Loc:** `packages/db/src/migrations/index.ts:1-4`, `packages/db/src/schema/index.ts:24`

Only an interface is exported — no version list, no `.upgrade()` handlers. Fields the app relies on (`parentMessageId`, `activeChildId`) were added without a version bump and are backfilled ad-hoc in code. **Impact:** the next `stores()` change without a version bump throws `VersionError`/`SchemaError` on open for existing users, potentially making prior chat data inaccessible. **Fix:** maintain ordered `version()` blocks, bump on every schema change, add `.upgrade()` handlers + an old-DB-open test.

### M11. Invalid numeric settings throw on save as a swallowed rejection (change silently lost)
**Category:** correctness-bug · **Confidence:** high · **Raw:** #25, #26 · **Loc:** `apps/extension/entrypoints/options/App.tsx:92-104, 379-409`

`persistSettings` optimistically updates UI then `await saveSettings(...)` with **no try/catch**, invoked via `void persistSettings(...)`. `PositiveIntegerSchema` throws for `0`/negative/`NaN`/non-integer. The "Max conversations"/"Max age days" inputs lack the `Number.isFinite` guard that the context-cap input has, so clearing a field (`Number('') === 0`) throws → unhandled rejection → change silently dropped (and a stale "Settings saved." banner, #78). **Fix:** clamp/validate inputs to integers ≥ min before saving; wrap `saveSettings` in try/catch and surface a failure status.

### M12. Selected-text `focusText` is never cleared → stale selection leaks across tabs, chats, and follow-ups
**Category:** privacy · **Confidence:** high · **Raw:** #23 · **Loc:** `apps/extension/store/sidepanelstore.ts:393-401`

`focusText` is set from a quick action but never reset — not on `startFreshChat`, `openConversation`, tab switch, or after a send. `retryMessage`/`editMessage` thread it into every subsequent `sendPrompt`. **Impact:** selected text from one (possibly sensitive) page is silently appended as "focus" to later, unrelated prompts and shown in the Selection banner. **Fix:** clear `focusText` on fresh chat, conversation open, tab switch, and after a manual send.

---

## 🟡 Low-Severity Findings (grouped)

> ⚠️ **Reliability call-out:** #45 below is rated Low (low *likelihood*) but has **high impact** — fix it early.

| # | Theme | Raw | Location | Summary & fix |
|---|-------|-----|----------|---------------|
| **L-rel** | `walkActivePath` has no cycle guard → **infinite loop / tab freeze** | #45 | `packages/core/src/conversations/walk.ts:74-87` | Runs synchronously in render (`App.tsx:120`) and before every send (`chat.ts:599`). A cyclic `parentMessageId` (corrupt row / future migration bug) hangs/OOMs the tab. **Fix:** add a `visited` Set + iteration cap. Same for `switchActivePathTo` (`chat.ts:676`). |
| L1 | Manifest least-privilege | #37, #38, #39, #69 | `apps/extension/wxt.config.ts:35-36` | Unused `scripting` permission; `activeTab` redundant under standing `<all_urls>`; broad `<all_urls>` host access. **Fix:** drop `scripting`; pick one access model (activeTab+on-demand vs `<all_urls>`); pair with M6 CSP. |
| L2 | Content-script extraction quality | #31, #32, #33, #40 | `entrypoints/content.ts`, `src/content/extraction.ts`, `background.ts:134` | Two competing `selectionchange` listeners w/ no teardown (#31); duplicate code-block emission for `<pre><code>` (#32); visibility check ignores hidden ancestors → extracts concealed text (#33); naive `.pdf`-suffix PDF detection (#40). **Fix:** consolidate listeners via WXT `ctx`; skip `<code>` inside `<pre>`; use `element.checkVisibility()`; detect PDF by MIME/embed. |
| L3 | Excluded-site matching | #41 | `background.ts:56-74` | `startsWith` on full URL: `https://example.com` matches `example.com.evil.com` and under-matches paths. **Fix:** compare by parsed origin. |
| L4 | Streaming/provider robustness | #43, #44 | `chat.ts:419-424`, `providers/index.ts:245-247` | Raw provider error body persisted+shown verbatim (#43); SSE buffer unbounded → memory growth on a malformed/hostile stream (#44). **Fix:** genericize+length-cap error text; cap buffer size + add idle timeout. |
| L5 | Prompt construction | #46, #47, #67 | `prompts/index.ts:44-83` | Truncation marker appended *after* the cap slice (overshoots by ~7 tokens, #46); page/selected text inlined into a **system** message with no delimiting → indirect prompt injection (can steer answers, **cannot** leak the key) (#47, #67). **Fix:** reserve marker room before slicing; fence untrusted page text as data in a user-role block with an "treat as data, not instructions" preamble. |
| L6 | Conversation walk ordering | #48 | `walk.ts:29-42` | Unstable tie-break on equal `createdAt` → sibling index can disagree with the selected branch. **Fix:** total order on `(createdAt, id)` in both `pickActiveChild` and `describeSiblings`. |
| L7 | Streaming lifecycle correctness | #52, #53, #54, #55, #57 | `chat.ts`, `sidepanelstore.ts` | `requestContext` overwrites live messages mid-stream w/o `isStreaming` guard (#52); context snapshot/metrics persisted before request success → orphan rows on failure (#53); `sendPrompt` early-return `false` swallowed by retry/edit/quick-action callers → silent no-op (#54); first chunk forces an immediate flush + per-flush full-content rewrite → O(n²) writes (#55); cancelled/failed streams leave an empty assistant node that parents the next send and pollutes prompt history (#57). **Fix:** guard mid-stream replacement; persist context after first chunk (or clean up on error); surface a reason on early-return; init `lastFlush = Date.now()` + coarser DB cadence; delete/skip empty assistant nodes. |
| L8 | History/edit UX | #58, #59 | `sidepanelstore.ts:556-579, 462-468` | `historyEntries` cache never invalidated after first load → new chats missing (#58); "edit" never sets `editedAt` and appends a new trailing turn instead of branching → dead "edited" UI (#59). **Fix:** invalidate cache on create/update; implement real edit (branch from original parent, set `editedAt`) or remove the dead indicator. |
| L9 | Options UI | #61, #62, #78 | `options/App.tsx` | API-key `<input>` has no `autoComplete="off"`/`new-password` → password manager may capture+sync the key off-device (#61); default-model select desyncs when the chosen default is hidden (#62); "Settings saved." banner never clears (#78). **Fix:** harden the key field; reassign default when hidden; auto-clear/error the status. |
| L10 | Type/data hygiene | #63, #51, #50, #70 | `models/index.ts:36`, `db/src/schema/index.ts:25`, `db/src/repositories/index.ts:110` | `fromInternalModelId` unchecked `as ProviderId` cast misbehaves on a malformed id (#63); boolean `pinned` is a dead IndexedDB index (booleans aren't valid keys) (#51); `tabSessions` never deleted (#50); `getByTabId().last()` returns by PK order not recency — *uncertain*, only matters under a narrow duplicate-row race (#70). **Fix:** validate the provider prefix; drop/`0|1` the index; `onRemoved` cleanup; `sortBy('updatedAt')` or a tabId-derived primary key. |
| L11 | Selector state layer | #60 | `ui/modelSelector.tsx:50-54` | Ephemeral search/provider UI state lives in the global store and recomputes every keystroke. **Fix:** local `useState` + `useMemo`. |

---

## ⚪ Informational (no action required for security)

- **#72** Markdown links use `rel="noreferrer"` (implies `noopener`) + Chromium defaults `target=_blank` to `noopener`; `react-markdown` blocks unsafe href protocols. No real risk — optionally set `rel="noopener noreferrer"` for explicitness.
- **#73** Quick-action/context-menu dispatch opens the panel without an *independent* background policy gate; the side panel re-checks before running, so no live bypass — add a background-side `classifyUrl` for defense-in-depth.
- **#75** `list()` uses an in-memory `.filter()` scan; retention age basis is "last touched" (`updatedAt`) not "last message". Decide deliberately when wiring retention.
- **#76** `TokenUsageMeter` casts a CSS custom property via `as CSSProperties` — clamped integer, no injection risk; type nit.
- **#77** (Verified safe) `ModelSelector`/`RetryDropdown` listeners *are* cleaned up; retry control *is* disabled while streaming. No leak.
- **#71** Dead `EncryptedSecretRecord` type (missing `iv`) on the public API — delete it (folded into M1).
- **#78** Stale "Settings saved." banner (folded into M11).

---

## Remediation Plan

Ordering rationale: **Phase 0** fixes things that *silently break a guarantee the product makes to the user today* and are mostly small, self-contained changes. **Phase 1** closes the security/defense-in-depth boundaries. **Phase 2** fixes correctness bugs that degrade reliability and cost. **Phase 3** is hardening and polish.

### Phase 0 — Honor the product's own guarantees (do first)
- [ ] **H2** — Gate all Dexie writes in `streamChatImplementation` on `settings.saveHistory`. *(Privacy promise is broken right now.)*
- [ ] **H4** — Add "Delete conversation" + "Clear all history" UI calling the already-implemented repository `delete` cascades; add `tabs.onRemoved` cleanup. *(No way to erase data today.)*
- [ ] **H1** — Add sender validation to `addChromeMessageListener` / handlers; never trust `message.tabId` from content scripts. *(Closes cross-tab extraction + quick-action injection root cause.)*
- [ ] **H6 + H5** — Add `tabs.onActivated`/`onUpdated` listeners in the side panel that abort the stream, reset state, re-bind to the new tab, and re-run the sensitivity check; re-classify context before every send; stamp `upsertMessage` with `conversationId`. *(Stops cross-tab bleed and the sensitive-page TOCTOU.)*
- [ ] **L-rel (#45)** — Add a `visited` Set + iteration cap to `walkActivePath`/`switchActivePathTo`. *(Cheap; prevents a hard tab freeze.)*

### Phase 1 — Security boundaries & key handling
- [ ] **H3 (+M9, #49)** — Wire `createRetentionPruningPlan` to a `chrome.alarms` job; map settings→policy explicitly; aggregate `conversation.storageBytes`.
- [ ] **M6** — Add a hardened `extension_pages` CSP with a `connect-src` provider allowlist.
- [ ] **M1 (+#29, #30, #71)** — Move the encryption key out of `chrome.storage.local` (non-extractable key in IndexedDB, or `storage.session`); validate base64/IV; delete the dead type; correct the "encrypted" product copy.
- [ ] **M5** — Constrain `actionId` to known literals; accept `quickActionRequest` only from the trusted background.
- [ ] **M2, M3, M4, M7** — Extend sensitive-page coverage: `all_frames` + shadow/iframe signals, structural-first detection, URL-level auth/banking/checkout + scheme allowlist, gate selection capture on sensitivity.

### Phase 2 — Correctness & cost
- [ ] **M8** — Budget the whole prompt (system + history + question), not just the page envelope.
- [ ] **M10** — Introduce a real Dexie migration framework + old-DB-open test.
- [ ] **M11** — Validate/clamp settings inputs; surface save errors.
- [ ] **M12** — Clear `focusText` on fresh chat / conversation open / tab switch / after send.
- [ ] **L4, L7, L8** — Streaming robustness (error genericization, SSE buffer cap, flush cadence, empty-node cleanup, snapshot-on-success, surfaced early-returns, history-cache invalidation, real edit semantics).

### Phase 3 — Hardening & polish
- [ ] **L1** — Manifest least-privilege (drop `scripting`, resolve `activeTab` vs `<all_urls>`).
- [ ] **L2, L3, L5, L6, L9, L10, L11** — Extraction quality, excluded-site origin match, prompt fencing, deterministic ordering, options-UI fixes, type hygiene, selector state.
- [ ] **Info** — #72/#73/#75/#76 optional defense-in-depth and deliberate decisions.

---

## Appendix — Coverage

13 dimensions audited: crypto & API-key storage · content-script extraction & sensitive-DOM · XSS/output rendering · runtime-messaging trust · manifest/permissions/CSP · sensitive-page policy enforcement · provider client/network/key-leak · prompt construction & injection · Dexie storage/retention/privacy · chat streaming lifecycle · Zustand store & React UI state · options/settings & misc core · cross-cutting trust boundaries & data flow. Each finding was independently confirmed by an adversarial verifier reading the cited code; 2 candidates were refuted and excluded.
