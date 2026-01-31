# @ank1015/llm-types

Shared type definitions for the LLM SDK.

## Commands

- `pnpm build` — Compile TypeScript to dist/
- `pnpm dev` — Watch mode compilation
- `pnpm typecheck` — Type-check without emitting

## Structure

- `src/index.ts` — Public type exports

## Conventions

- Types only — No runtime code
- Export all types from `src/index.ts`
- Use descriptive JSDoc comments on all exports

## Dependencies

- Depends on: (none)
- Depended on by: @ank1015/llm-core
