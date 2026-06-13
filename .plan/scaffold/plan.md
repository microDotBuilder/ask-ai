# Scaffold Implementation Plan

## Goal

Create the initial Bun workspace, WXT extension app, shared packages, and tooling foundation.

## Dependencies

- Architecture decisions are recorded in `docs/architecture`.
- Bun is the package manager.
- WXT is the extension framework.

## Deliverables

- Root Bun workspace.
- `apps/extension` WXT app.
- `packages/core`, `packages/db`, `packages/ui`, and `packages/config`.
- Minimal side panel and options pages.
- Working scripts for development, build, typecheck, lint, and formatting.

## Tasks

### S1: Root Workspace

Status: completed

Steps:

- Create root `package.json`.
- Configure Bun workspaces for `apps/*` and `packages/*`.
- Add root scripts:
  - `dev`
  - `build`
  - `check`
  - `typecheck`
  - `lint`
  - `format`
  - `test`
- Add root `.gitignore`.
- Add root `README.md` if missing.

Acceptance:

- `bun install` completes.
- Workspace packages are discoverable by Bun.

### S2: Shared Config Package

Status: completed

Steps:

- Create `packages/config/package.json`.
- Add shared TypeScript configs:
  - `tsconfig/base.json`
  - `tsconfig/react.json`
  - `tsconfig/extension.json`
- Add shared Biome config.
- Add shared Vitest config placeholder.

Acceptance:

- Other packages can extend shared TypeScript config.
- Root scripts can use shared config without path ambiguity.

### S3: Core Package

Status: completed

Steps:

- Create `packages/core/package.json`.
- Create `packages/core/src/index.ts`.
- Add initial folders:
  - `actions`
  - `context`
  - `crypto`
  - `messages`
  - `models`
  - `policy`
  - `prompts`
  - `providers`
  - `settings`
  - `tokens`
  - `types`
- Export placeholder modules from `index.ts`.

Acceptance:

- `@askai/core` can be imported by other workspace packages.

### S4: DB Package

Status: completed

Steps:

- Create `packages/db/package.json`.
- Create `packages/db/src/index.ts`.
- Add initial folders:
  - `schema`
  - `repositories`
  - `migrations`
  - `retention`
  - `usage`

Acceptance:

- `@askai/db` can be imported by the extension app.

### S5: UI Package

Status: completed

Steps:

- Create `packages/ui/package.json`.
- Create `packages/ui/src/index.ts`.
- Add initial folders:
  - `components`
  - `icons`
  - `styles`
- Add Tailwind-compatible shared style entrypoint.

Acceptance:

- `@askai/ui` can be imported by the side panel and options app.

### S6: WXT Extension App

Status: completed

Steps:

- Create `apps/extension/package.json`.
- Add WXT config.
- Add entrypoints:
  - `entrypoints/background.ts`
  - `entrypoints/content.ts`
  - `entrypoints/sidepanel/index.html`
  - `entrypoints/sidepanel/main.tsx`
  - `entrypoints/sidepanel/App.tsx`
  - `entrypoints/options/index.html`
  - `entrypoints/options/main.tsx`
  - `entrypoints/options/App.tsx`
- Add `src/background`, `src/content`, `src/sidepanel`, `src/options`, and `src/chrome`.

Acceptance:

- WXT dev command starts.
- Side panel placeholder renders.
- Options placeholder renders.

### S7: Tailwind And UI Tooling

Status: completed

Steps:

- Configure Tailwind for the extension app.
- Configure shadcn/ui with Base UI.
- Add lucide-react.
- Add base CSS/theme tokens.
- Confirm side panel styles load.

Acceptance:

- Placeholder side panel renders with Tailwind styles.

### S8: Tooling Verification

Status: completed

Steps:

- Run install.
- Run typecheck.
- Run lint.
- Run format check.
- Run build.

Acceptance:

- `bun run check` passes.
- Extension build output is produced.

## Risks

- WXT side panel entrypoint conventions may require small structure adjustments.
- shadcn/ui Base UI setup may need repo-specific config choices.

## Done When

- The monorepo installs cleanly.
- The extension app builds.
- Side panel and options placeholders render.
- Shared packages compile.
