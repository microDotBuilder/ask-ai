# Chat Implementation Plan

## Goal

Build the core page-aware streaming chat loop.

## Dependencies

- Scaffold plan complete.
- Foundation plan complete enough for settings, storage, and model catalog.
- Extension runtime can provide page context.

## Deliverables

- User can ask about the current page.
- Provider response streams into side panel.
- Conversation and messages persist in IndexedDB.
- Provider errors are shown clearly.

## Tasks

### C1: Provider Client Interface

Status: complete

Steps:

- Define OpenAI-compatible chat request shape.
- Define provider config.
- Define streaming chunk shape.
- Add provider ID parsing from internal model ID.

Acceptance:

- OpenAI and OpenRouter can share the same provider client.
- Anthropic and Gemini choices route through OpenRouter model IDs.

### C2: Provider Config Resolution

Status: complete

Steps:

- Resolve selected provider/model from settings.
- Load encrypted API key record.
- Decrypt key locally.
- Build provider base URL and headers.

Acceptance:

- Chat service can produce a valid provider request config.

### C3: Streaming Parser

Status: complete

Steps:

- Implement Server-Sent Events parser for OpenAI-compatible streams.
- Extract content deltas.
- Detect finish reason.
- Handle malformed chunks.
- Handle provider-specific error payloads.

Acceptance:

- Stream parser produces normalized chunks.

### C4: Prompt Assembly

Status: complete

Steps:

- Build normal chat prompt envelope.
- Include system prompt.
- Include page title, URL, and domain.
- Include full-page context.
- Include selected/pasted focus when present.
- Include active conversation messages.
- Add truncation marker when context was truncated.

Acceptance:

- Chat request contains enough page context without storing hidden context in history.

### C5: Chat Service

Status: complete

Steps:

- Validate page status.
- Validate provider settings.
- Create user message.
- Create empty assistant message.
- Start provider stream.
- Support cancellation.
- Map typed errors with Effect.

Acceptance:

- Chat service can drive a full streaming response.

### C6: Streaming Persistence

Status: complete

Steps:

- Buffer assistant chunks in memory.
- Flush assistant content to Dexie every 500ms or meaningful batch.
- Write final assistant content on completion.
- Save token estimate and storage bytes.
- Save error metadata on failure/cancel.

Acceptance:

- Partial and final assistant messages are persisted safely.

### C7: Chat UI

Status: complete

Steps:

- Add message list.
- Add prompt input.
- Add send button.
- Add stop/cancel button.
- Add streaming assistant renderer.
- Add copy response action.
- Add regenerate placeholder or defer.

Acceptance:

- User can send a prompt and see a streaming answer.

### C8: Active Conversation Restore

Status: complete

Steps:

- Load tab session active conversation.
- Load messages for active conversation.
- Restore draft prompt.
- Restore context mode/status.

Acceptance:

- Returning to a tab can restore its active conversation.

## Risks

- Provider streaming formats may differ slightly.
- Extension page closure can interrupt active streams.

## Done When

- A normal webpage chat request streams successfully.
- Conversation persists in IndexedDB.
- Provider errors are displayed and stored.
