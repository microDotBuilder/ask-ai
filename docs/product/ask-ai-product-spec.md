# Ask AI Product Spec

## Summary

Ask AI is a Chrome extension that opens a tab-specific side panel assistant for the current webpage. Users can ask questions about selected text, pasted text, or the whole page. The assistant uses full-page text context in V1 and works with user-provided AI provider keys.

Core promise:

> Ask anything about the page you are viewing, with useful context automatically included.

## Target Users

- Students studying articles, docs, papers, and learning materials.
- Professionals reading web pages, reports, emails, and business content.
- Developers working with GitHub, documentation, code snippets, and technical articles.
- Researchers reading long-form articles, documentation, references, and source material.

## Product Principles

- Context should be automatic. Users should not have to decide whether page context is needed for normal use.
- The user controls when AI work happens. No model calls happen just because a page is loaded.
- Selected or pasted text is the focus, but page context is still included by default.
- V1 should support advanced AI users without making normal users configure advanced settings.
- BYOK comes first. Subscription billing is a future product layer.
- Privacy should be visible and understandable.
- Each browser tab should feel like it has its own assistant.

## V1 Scope

### Platform

- Google Chrome extension.
- Manifest V3.
- Chrome side panel as the primary UI.
- Floating Ask AI button after text selection.
- Toolbar icon to open Ask AI without selecting text.
- Keyboard shortcuts.
- Right-click context menu.

### AI Provider Support

V1 supports bring-your-own-key provider setup for:

- Direct OpenAI.
- OpenRouter.

Anthropic Claude and Google Gemini models are supported through OpenRouter routes in V1. Direct Anthropic and direct Gemini provider integrations are deferred until after the OpenAI and OpenRouter implementation is stable.

Users can:

- Add API keys locally.
- Test provider connection.
- Choose a default provider and model.
- Change model from the side panel.

### Context Support

Ask AI supports text-only context in V1.

Default context behavior:

- Full-page context is enabled by default.
- Selected text becomes the focus.
- Pasted text becomes the focus.
- Page title, URL, and relevant page content are included when available.

V1 context mode:

- Full Page: include the full readable page text within model limits.

Smart context is deferred. It will require retrieval/RAG-style context selection and is a candidate for a later paid feature.

There is no selected-text-only mode in V1 because isolated selections can produce lower-quality answers.

### User Entry Points

With selected text:

1. User selects text on a webpage.
2. Floating Ask AI button appears near the selection.
3. User clicks the button.
4. Tab-specific side panel opens.
5. Ask AI treats the selection as focus and adds full-page context.

Without selected text:

1. User clicks the Chrome toolbar icon, uses a keyboard shortcut, or opens the right-click menu.
2. Tab-specific side panel opens for the current tab.
3. Ask AI extracts full-page context for the current page.
4. User asks a question or chooses a quick action.

Unsupported page:

- Side panel still opens when possible.
- Page context is marked unavailable.
- User can ask a general question or paste text manually.

### Quick Actions

Default quick actions:

- Summarize.
- Explain.
- Explain code.
- Rewrite.
- Translate.
- Simplify.

AI-generated page-specific suggestions are deferred until normal chat, default quick actions, and keyboard shortcut flows are stable.

Examples:

- Article or blog: summarize article, extract key points, explain argument, list claims to verify.
- GitHub: explain repository, summarize README, explain selected code, generate usage example.
- Docs site: show example, explain step by step, compare options, troubleshoot.
- Research-like content: summarize, extract key findings, explain methodology, list limitations, create study notes.

Smart suggestions can use a small utility model later, but they must not run before the user opens Ask AI. Because users pay through their own keys in V1, suggestion generation should be visible, cached per page, and configurable.

### Future Custom Quick Actions

Custom quick actions are deferred until after default quick actions are stable.

Simple mode:

- User gives the action a name.
- User writes a plain prompt.
- Example: "Turn this into study notes."

Advanced mode in settings:

- Supports template variables such as `{focus}`, `{page_context}`, `{title}`, and `{url}`.
- Intended for advanced users who want precise workflows.

### History

History is saved by default.

V1 history behavior:

- Local-only history.
- Conversation history is tab-specific while active.
- Saved history is grouped by URL.
- If the same URL is open in two tabs, each tab has its own active conversation.
- Both conversations can later appear under the same URL in history.

History records include:

- Page title.
- Domain.
- URL.
- Date and time.
- Model used.
- Context mode.
- First user question.
- Conversation thread.

Users can:

- Search history.
- Delete one conversation.
- Clear all history.
- Turn history saving off.
- Exclude specific sites from history.

### Tab-Specific Side Panel Behavior

Ask AI should behave like a per-tab assistant.

Expected behavior:

- Opening Ask AI in Tab A opens a side panel tied to Tab A.
- Switching to Tab B hides Ask AI unless Tab B has its own open Ask AI session.
- Opening Ask AI in Tab B starts a separate tab session.
- Returning to Tab A restores the side panel if it was previously open.
- Closing Ask AI in one tab does not close it in other tabs.

Tab session state includes:

- Tab ID.
- Current URL.
- Page title.
- Side panel open or closed state.
- Draft prompt.
- Selected or pasted focus.
- Context mode.
- Current conversation ID.

### Keyboard Shortcuts

V1 includes keyboard shortcuts.

Recommended defaults:

- `Cmd/Ctrl + Shift + A`: open Ask AI for the current tab.
- `Cmd/Ctrl + Shift + E`: explain selected text.
- `Cmd/Ctrl + Shift + S`: summarize current page.

Chrome lets users customize extension shortcuts, so settings should include a keyboard shortcuts section that explains how to edit them.

### Supported Content Targets

V1 priority targets:

- Normal webpages.
- Articles.
- Blogs.
- Documentation sites.
- GitHub pages.
- Readable web apps.

PDF extraction is not supported in V1. Users can manually copy and paste PDF text into Ask AI.

### Settings

Default settings:

- Provider and model.
- API key management.
- Full-page context by default.
- Save local history by default.
- Default language.
- Smart suggestions on or off, defaulting to no provider calls in the first implementation.

Advanced settings:

- System prompt.
- Temperature.
- Max tokens.
- Context size.
- Context extraction preference.
- Utility model for smart suggestions.
- Provider fallback order.
- Custom quick action templates.
- Excluded sites for page context.
- Excluded sites for history.

## Main Side Panel UX

Top bar:

- Ask AI name/logo.
- Model selector.
- New chat button.
- History button.
- Settings button.

Context area:

- Page title.
- Domain.
- Context status.
- Context mode/status for Full Page.
- Preview context link.

Quick actions:

- Default actions.
- Keyboard shortcut-triggered default actions.

Chat area:

- User message.
- AI response.
- Follow-up questions.
- Copy response action.
- Regenerate action.

Input:

- Prompt box.
- Send button.
- Current context indicator.

## First-Time Setup

1. Welcome screen explains that Ask AI uses the user's own AI keys.
2. User chooses a provider.
3. User enters API key.
4. Ask AI tests the connection.
5. User chooses a default model.
6. Ask AI confirms defaults:
   - Full-page context on.
   - Local history on.
   - Smart suggestions configurable.

Recommended setup copy:

> Your API key is stored locally. Page content is only sent when you open Ask AI or ask a question.

## Privacy And Trust Requirements

- No AI model calls happen when a page merely loads.
- Page content is sent only after the user opens Ask AI, clicks a quick action, or submits a prompt.
- Users can preview full-page context before sending.
- Users can exclude specific sites from context and history.
- API keys are stored locally.
- History is local-only in V1.
- Sensitive pages should show a clear disabled state and should not send page content to providers.

## V1 Non-Goals

The following are explicitly out of scope for V1:

- Paid subscription.
- Managed AI credits.
- Cloud sync.
- Team accounts.
- Deep research.
- Multi-page research.
- Agentic browser automation.
- Image or screenshot understanding.
- PDF text extraction.
- Uploaded PDF parsing.
- Local `file://` PDF support.
- Full document upload.
- Cross-browser support.
- Mobile support.
- Collaboration features.
- Sharing conversations.
- Organization admin controls.
- Smart/RAG context extraction.
- Direct Anthropic provider integration.
- Direct Google Gemini provider integration.
- Custom quick actions.

## Future Features

Post-V1 candidates:

- Paid subscription with managed AI usage.
- Cloud sync for settings and history.
- Deep research across multiple pages.
- PDF extraction and uploaded PDF support.
- Screenshot and image understanding.
- YouTube transcript support.
- Gmail and Google Docs specialized workflows.
- Notion and workspace app integrations.
- Citation-aware research answers.
- Team workspaces.
- Shared prompt libraries.
- Organization policy controls.
- Managed provider keys for teams.
- Browser support beyond Chrome.
- Mobile companion app.
- Voice input.
- Export history to Markdown, PDF, or Google Docs.
- AI provider cost tracking.
- Per-model quality and cost recommendations.
- Smart/RAG context extraction as a paid feature.
- Direct Anthropic and direct Google Gemini provider integrations.

## Success Metrics

Early product metrics:

- Extension installed.
- Provider connected successfully.
- First prompt sent.
- First answer copied or reused.
- Weekly active users.
- Prompts per active user.
- Quick action usage.
- Context preview usage.
- History revisit rate.
- Provider setup failure rate.

Qualitative signals:

- Users understand when page context is being used.
- Users trust that the extension is not sending page content in the background.
- Users can open Ask AI with and without selecting text.
- Advanced users can configure models without overwhelming normal users.

## Open Questions

- What is the exact visual design direction for the side panel?
- Which exact OpenAI and OpenRouter models should be recommended first?
- How much local history should be retained by default?
- Should excluded sites apply to context, history, or both by default?
