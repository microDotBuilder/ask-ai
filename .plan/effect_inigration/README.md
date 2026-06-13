# Effect Migration Plan

This folder contains the plan for using Effect and Effect Schema as the typed boundary layer across Ask AI.

The folder name intentionally follows the requested path `effect_inigration`. Treat this as the Effect migration plan.

## Scope

- Runtime message validation.
- Chrome transport response decoding.
- Provider client and streaming error typing.
- Chat service error and async workflow typing.
- Settings, session storage, and API key boundary validation.
- Dexie persisted-record validation.
- Context privacy and selected-text context-mode cleanup.

## Non-Goals

- Do not wrap every pure helper in Effect.
- Do not move React component rendering into Effect.
- Do not introduce Effect services before the runtime boundaries are strongly typed.

## Related Plans

- `../foundation/plan.md`
- `../extension-runtime/plan.md`
- `../chat/plan.md`
- `../verification/plan.md`
