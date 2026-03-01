# @ank1015/llm-agents

Agent toolkit package for the LLM monorepo.

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
  index.ts              — Public exports
  tools/
    index.ts            — Tool exports and shared entrypoint
    browser/
      search.ts         — Web search tool
    file-system/
      index.ts          — File-system tool exports and factories
      *.ts              — File-system tools (read, write, edit, bash, grep, find, ls)
      utils/            — Shared file-system tool utilities
tests/
  unit/
    index.test.ts       — Unit smoke tests
  integration/
    index.test.ts       — Integration smoke tests
```
