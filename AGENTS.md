# @ank1015/llm

TypeScript SDK monorepo for LLM interactions.

## Commands

```bash
pnpm install          # Install dependencies
pnpm build            # Build all packages
pnpm test             # Run all tests
pnpm typecheck        # Type-check all packages
pnpm clean            # Remove all build artifacts
```

## Architecture

```
packages/
  core/               # @ank1015/llm-core - Core SDK types and utilities
```

## Conventions

- Use strict TypeScript (see tsconfig.base.json)
- Export types explicitly from index.ts
- Use Zod for runtime validation
- Tests colocated as `*.test.ts`
- Conventional commits: `feat(core): add feature`

## Key Files

- `tsconfig.base.json` — Shared TypeScript configuration
- `turbo.json` — Task orchestration
- `packages/core/src/index.ts` — Core package entry

## Package Guide

- [packages/core/AGENTS.md](packages/core/AGENTS.md) — Core SDK

## Boundaries

**Never:**
- Commit secrets or API keys
- Use `any` type without justification
- Skip TypeScript strict checks

**Ask first:**
- Adding new dependencies
- Creating new packages
- Changing build configuration

**Freely:**
- Add tests
- Fix type errors
- Refactor within existing patterns
