# @ank1015/llm-sdk-adapters

Node.js adapter implementations for @ank1015/llm-sdk. Provides file-based, SQLite, and in-memory adapters.

## Commands

- `pnpm build` — Compile TypeScript to dist/
- `pnpm dev` — Watch mode compilation
- `pnpm test` — Run all tests
- `pnpm test:unit` — Run unit tests
- `pnpm test:integration` — Run integration tests
- `pnpm typecheck` — Type-check without emitting

## Structure

```
src/
  index.ts              — Public exports (all adapters)
  file-keys.ts          — AES-256-GCM encrypted file-based keys storage
  sqlite-usage.ts       — SQLite-based usage tracking (WAL mode)
  file-sessions.ts      — JSONL append-only session storage with branching
  memory-keys.ts        — In-memory keys adapter (for testing)
  memory-usage.ts       — In-memory usage adapter (for testing)
  memory-sessions.ts    — In-memory sessions adapter (for testing)
```

## Adapters

### File-based (Node.js specific)

- `FileKeysAdapter` — Encrypted keys in ~/.llm/global/keys/
- `SqliteUsageAdapter` — Usage data in ~/.llm/global/usages/messages.db
- `FileSessionsAdapter` — Sessions in ~/.llm/sessions/<project>/<path>/<id>.jsonl

### In-memory (zero deps, for testing)

- `InMemoryKeysAdapter` — Map-based key storage
- `InMemoryUsageAdapter` — Array-based message storage
- `InMemorySessionsAdapter` — Map-based session storage with full tree support

## Conventions

- Adapter implementations import interfaces from `@ank1015/llm-types`
- File adapters include path traversal protection (`sanitizePath`)
- Session adapters validate `parentId` existence and throw `InvalidParentError`
- Session adapters throw `SessionNotFoundError` when provided `sessionId` doesn't exist

## Dependencies

- Depends on: @ank1015/llm-core, @ank1015/llm-types, better-sqlite3
- Depended on by: @ank1015/llm-chat-app, (consumer applications)
