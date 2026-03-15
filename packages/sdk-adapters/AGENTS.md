# @ank1015/llm-sdk-adapters

Node-oriented adapter implementations for `@ank1015/llm-sdk`.

This package now owns only concrete keys and sessions storage:

- file-system adapters for persisted encrypted keys and JSONL sessions
- in-memory adapters for tests and lightweight local usage

It does not own usage tracking, browser-facing code, or UI utilities.

## Commands

- `pnpm build` — clean `dist/` and compile TypeScript
- `pnpm dev` — watch mode compilation
- `pnpm test` — run all tests
- `pnpm test:unit` — run unit tests
- `pnpm test:integration` — run integration tests
- `pnpm test:coverage` — run tests with coverage
- `pnpm typecheck` — type-check without emitting
- `pnpm lint` — run ESLint for the package
- `pnpm clean` — remove build output and coverage

## Structure

```text
src/
  index.ts                           — public exports
  file-system/
    file-keys.ts                     — encrypted filesystem KeysAdapter
    file-sessions.ts                 — JSONL filesystem SessionsAdapter
  memory/
    memory-keys.ts                   — in-memory KeysAdapter
    memory-sessions.ts               — in-memory SessionsAdapter
  shared/
    credentials.ts                   — shared credential normalization
    session-id.ts                    — local UUID helper

tests/
  unit/
    file-system/                     — file adapter behavior
    memory/                          — in-memory adapter behavior
  integration/
    file-system/                     — real filesystem adapter checks
    sdk/                             — SessionManager compatibility checks
```

## Public Surface

Root exports only:

- `FileKeysAdapter`
- `createFileKeysAdapter`
- `FileSessionsAdapter`
- `createFileSessionsAdapter`
- `InMemoryKeysAdapter`
- `InMemorySessionsAdapter`

Do not add usage adapters or UI/server utilities back into this package.

## Conventions

- Import adapter interfaces and shared errors from `@ank1015/llm-types`
- Keep package internals Node-only, but keep the public API small and root-exported
- Preserve legacy single-key compatibility inside `FileKeysAdapter`
- Validate path inputs and throw `PathTraversalError` for unsafe components
- Validate `parentId` in session adapters and throw `InvalidParentError`
- Throw `SessionNotFoundError` when session IDs do not exist

## Testing

- Implementation tests for concrete adapters belong here
- `sdk` should only test wrapper behavior, not adapter storage details
- `sdk` compatibility coverage for `SessionManager` stays here because it validates the concrete sessions adapter
- Add tests for new adapter behaviors before publishing

## Dependencies

- Depends on: `@ank1015/llm-types`
- Used by: `@ank1015/llm-server`, `@ank1015/llm-agents`, and any Node-side consumers that want ready-made keys/session adapters
