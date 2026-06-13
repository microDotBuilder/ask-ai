# Ask AI

Ask AI is a Chrome Manifest V3 extension that adds a tab-specific AI assistant to the browser side panel. It reads the current webpage, lets the user ask questions about that page, and includes the page context automatically when sending prompts to the selected AI provider.

The app is designed for reading, studying, researching, and working through long-form web content such as articles, documentation, GitHub pages, technical references, and business pages.

## What It Does

- Opens an AI chat assistant in Chrome's side panel for the active tab.
- Extracts readable text from the current webpage and uses it as chat context.
- Lets users ask questions about the full page, selected text, or pasted text.
- Shows quick actions for common tasks such as summarizing, explaining, rewriting, translating, simplifying, and explaining code.
- Supports bring-your-own-key AI provider setup for OpenAI and OpenRouter.
- Lets users choose default providers and models, hide models, and favorite models.
- Streams assistant responses and supports stopping an in-progress response.
- Saves local chat history by default, with configurable retention limits.
- Provides privacy controls for excluding sites and disabling history.
- Stores provider keys locally in the browser extension environment.

## Main User Flow

1. Open a webpage in Chrome.
2. Open Ask AI from the toolbar, context menu, shortcut, or selected-text action.
3. Add an OpenAI or OpenRouter API key if this is the first run.
4. Ask a question or choose a quick action.
5. Ask AI sends the user prompt plus available page context to the selected model.

Each browser tab has its own active assistant session, so switching pages or tabs does not mix conversations.

## Provider Support

Ask AI currently supports:

- OpenAI
- OpenRouter

OpenRouter can be used to access additional model families such as Claude and Gemini through OpenRouter routes.

## Privacy Model

Ask AI is a bring-your-own-key extension. It does not include a hosted backend in the current version.

- API keys are saved locally.
- Chat history is saved locally when history is enabled.
- Page content is sent to the selected AI provider only when the user asks a question or runs a quick action.
- Users can disable history and exclude specific sites from page context or history.

Do not commit `.env`, `.env.local`, or other local secret files. They are ignored by Git.

## Project Structure

```text
apps/extension      Chrome extension built with WXT, React, and Zustand
packages/core       Shared product types, models, prompts, settings, and provider logic
packages/db         Local browser database schema, repositories, retention, and usage helpers
packages/ui         Shared UI components and styles
docs                Product, architecture, and QA notes
```

## Development

Install dependencies:

```sh
bun install
```

Start the WXT extension dev server:

```sh
bun run dev
```

Build the project:

```sh
bun run build
```

Publish an alpha GitHub Release:

```sh
bun run release:alpha
```

The alpha release command regenerates optimized alpha extension icons, builds the Chrome
Manifest V3 extension in production mode, writes a ZIP under `apps/extension/.output/`, and then
creates a prerelease on GitHub via the `gh` CLI — tagging the current commit, attaching the ZIP,
and writing branded release notes with the Ask AI Alpha logo at the top. The same Chrome
extension ZIP works on macOS, Windows, and Linux, so separate OS-specific releases are not needed
unless this later becomes a native desktop app.

Requires the [`gh` CLI](https://cli.github.com) to be installed and authenticated
(`gh auth login`), and the commit being released to be pushed to the remote. To build the ZIP
without publishing, run `bun run release:alpha --no-publish`.

Run checks:

```sh
bun run check
```

Run tests:

```sh
bun run test
```

## Scripts

- `bun run dev`: start the WXT extension dev server.
- `bun run build`: build all workspace packages and the extension.
- `bun run check`: run format, lint, typecheck, and build checks.
- `bun run icons:alpha`: regenerate optimized alpha extension icons.
- `bun run release:alpha`: build and publish a branded alpha GitHub prerelease (`--no-publish` to only build the ZIP).
- `bun run typecheck`: typecheck all workspace packages.
- `bun run lint`: run Biome linting.
- `bun run format`: format the repository with Biome.
- `bun run test`: run package tests.
- `bun run test:smoke`: run extension smoke tests.

## Current Status

Ask AI is in active development. The current version focuses on the Chrome extension side panel, local settings, local chat history, page-context extraction, BYOK provider setup, and model selection.
