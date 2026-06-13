# Scaffold Plan

## Objective

Create the initial repo foundation for Ask AI.

## Scope

- Bun workspace monorepo.
- WXT Chrome extension app.
- Shared packages: `core`, `db`, `ui`, and `config`.
- TypeScript setup.
- Tailwind setup.
- Biome setup.
- Minimal side panel and options entrypoints.

## Tasks

- [x] Create root `package.json` with Bun workspaces.
- [x] Create `apps/extension`.
- [x] Add WXT configuration.
- [x] Add extension entrypoints:
  - [x] `background.ts`
  - [x] `content.ts`
  - [x] `sidepanel`
  - [x] `options`
- [x] Create `packages/core`.
- [x] Create `packages/db`.
- [x] Create `packages/ui`.
- [x] Create `packages/config`.
- [x] Configure TypeScript project references or workspace path aliases.
- [x] Configure Tailwind for extension UI.
- [x] Configure Biome.
- [x] Add basic dev/build/check scripts.

## Done When

- `bun install` works.
- `bun run check` works.
- WXT dev server can start.
- Side panel renders a minimal placeholder.
- Options page renders a minimal placeholder.
