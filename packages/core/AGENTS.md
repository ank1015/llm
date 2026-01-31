# @ank1015/llm-core

Core SDK package providing foundational types and utilities for LLM interactions.

## Commands

- `pnpm build` — Compile TypeScript to dist/
- `pnpm dev` — Watch mode compilation
- `pnpm test` — Run tests with Vitest
- `pnpm typecheck` — Type-check without emitting

## Structure

- `src/index.ts` — Public exports
- `src/` — Source modules

## Conventions

- Export all public types and functions from `src/index.ts`
- Colocate tests as `*.test.ts` files
- Use Zod for runtime validation schemas

## Dependencies

- Depends on: (none yet)
- Depended on by: (none yet)
