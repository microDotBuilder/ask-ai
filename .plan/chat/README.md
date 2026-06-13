# Chat Plan

## Objective

Build the core chat experience for page-aware streaming conversations.

## Scope

- Prompt input.
- Prompt assembly.
- Provider client.
- Streaming response handling.
- Message persistence.
- Chat UI.

## Tasks

- [x] Add OpenAI-compatible provider client.
- [x] Add OpenAI direct provider config.
- [x] Add OpenRouter provider config.
- [x] Route Anthropic/Gemini model choices through OpenRouter model IDs.
- [x] Add streaming response parser.
- [x] Add provider error mapping with Effect.
- [x] Add cancellation support.
- [x] Add prompt assembly for normal chat.
- [x] Add user message creation.
- [x] Add assistant message creation.
- [x] Flush assistant message updates during streaming.
- [x] Write final message metadata and storage usage.
- [x] Add chat input UI.
- [x] Add streaming assistant response UI.
- [x] Add local tab/session history view.

## Done When

- User can ask a question about the current page.
- Response streams into the side panel.
- Conversation persists in IndexedDB.
- Refreshing/reopening the side panel can restore active conversation state.
