# Manual Verification Checklist

Use this checklist before release or before trusting a packaged extension build.

## Install And Load

- [ ] Run `bun install`.
- [ ] Run `bun run check`.
- [ ] Run `bun run test`.
- [ ] Run `bun run build`.
- [ ] Open `chrome://extensions`.
- [ ] Enable Developer mode.
- [ ] Load unpacked extension from `apps/extension/.output/chrome-mv3`.
- [ ] Confirm the Ask AI extension appears without manifest errors.

## Onboarding

- [ ] Open the extension side panel from the toolbar.
- [ ] Confirm first-run setup appears when no key is stored.
- [ ] Click `Test and finish setup` with an empty key.
- [ ] Confirm an inline validation message appears.
- [ ] Choose OpenAI and confirm OpenAI models are shown.
- [ ] Choose OpenRouter and confirm OpenRouter models are shown.
- [ ] Complete setup with a valid key.
- [ ] Confirm the side panel switches from setup to chat.

## Provider Keys

- [ ] Open options from the side panel Settings link.
- [ ] Save a valid OpenAI key and confirm status changes to `Saved`.
- [ ] Remove the OpenAI key and confirm status changes to `Missing`.
- [ ] Save a valid OpenRouter key and confirm status changes to `Saved`.
- [ ] Remove the OpenRouter key and confirm status changes to `Missing`.
- [ ] Enter an invalid key and confirm the provider error is shown without saving.

## Toolbar Chat

- [ ] Open a normal HTTP or HTTPS article page.
- [ ] Click the extension toolbar button.
- [ ] Confirm the side panel opens.
- [ ] Confirm page context status changes to `Context ready`.
- [ ] Confirm title, domain, character count, and content metrics are shown.
- [ ] Ask a question.
- [ ] Confirm the user message appears.
- [ ] Confirm the assistant streams a response.
- [ ] Click stop during a long response and confirm the assistant message is stopped.
- [ ] Reopen the side panel for the same tab and confirm the conversation restores.

## Keyboard Shortcuts

- [ ] Configure or confirm the `open-ask-ai` command in `chrome://extensions/shortcuts`.
- [ ] Trigger the open command on a normal page.
- [ ] Confirm the side panel opens for the active tab.
- [ ] Trigger the summarize-page command.
- [ ] Confirm a summarize quick action is queued and sent.
- [ ] Select text and trigger the explain-selected command.
- [ ] Confirm selected text appears as focus in the side panel.

## Selected Text

- [ ] Select text on a normal page.
- [ ] Confirm the floating `Ask AI` button appears near the selection.
- [ ] Scroll the page and confirm the floating button hides.
- [ ] Select text again and click the floating button.
- [ ] Confirm the side panel opens and uses the selected text as focus.

## Context Menu Actions

- [ ] Right-click a normal page and choose `Ask AI: Summarize page`.
- [ ] Confirm the side panel opens and runs the summarize action.
- [ ] Select text and right-click the selection.
- [ ] Run explain, rewrite, and simplify actions.
- [ ] Confirm each action opens the side panel and sends the expected prompt.

## Blocked And Unsupported Pages

- [ ] Open `chrome://extensions` and open the side panel.
- [ ] Confirm the UI says browser internal pages cannot be read.
- [ ] Open a Chrome Web Store page and confirm it is unsupported.
- [ ] Open a PDF URL and confirm PDFs are unsupported.
- [ ] Add a domain to excluded sites in options.
- [ ] Open that domain and confirm the side panel shows `Context blocked`.
- [ ] Open a page with a password input and confirm the side panel shows sensitive-page blocking.
- [ ] Open a page with credit card fields and confirm sensitive-page blocking.

## Options And Storage

- [ ] Change default provider and confirm default model updates to that provider.
- [ ] Change default model and confirm provider follows the selected model.
- [ ] Toggle model visibility and confirm hidden models disappear from the side panel picker.
- [ ] Toggle favorite models and confirm favorites sort first.
- [ ] Change context token cap and confirm settings save.
- [ ] Toggle save history.
- [ ] Change retention limits.
- [ ] Request persistent storage and confirm storage status updates when granted.
- [ ] Add and remove excluded sites.
- [ ] Toggle AI suggestions and confirm the side panel placeholder appears or hides.
- [ ] Reset settings and confirm defaults are restored.
