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
tests/
  unit/
    index.test.ts       — Unit smoke tests
  integration/
    index.test.ts       — Integration smoke tests
```
