# @ank1015/llm

TypeScript SDK monorepo for LLM interactions.

## Commands

```bash
pnpm install          # Install dependencies
pnpm build            # Build all packages
pnpm build:packages   # Build SDK packages only (excludes dashboard)
pnpm test             # Run all tests
pnpm test:unit        # Run unit tests only
pnpm test:integration # Run integration tests only
pnpm typecheck        # Type-check all packages
pnpm clean            # Remove all build artifacts

# Development
pnpm dev:server       # Start API server (port 3001)
pnpm dev:dashboard    # Start dashboard (port 3000)

# Production
pnpm start:server     # Start API server
pnpm start:dashboard  # Start dashboard
```

## Architecture

```
packages/
  types/              # @ank1015/llm-types - Shared type definitions
  core/               # @ank1015/llm-core - Core SDK utilities
  sdk/                # @ank1015/llm-sdk - Unified SDK (facade for types + core)
  server/             # @ank1015/llm-server - HTTP server (Hono)
  usage-dashboard/    # @ank1015/llm-usage-dashboard - Next.js usage dashboard
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

- [packages/types/AGENTS.md](packages/types/AGENTS.md) — Type definitions
- [packages/core/AGENTS.md](packages/core/AGENTS.md) — Core SDK
- [packages/sdk/AGENTS.md](packages/sdk/AGENTS.md) — Unified SDK facade
- [packages/server/AGENTS.md](packages/server/AGENTS.md) — HTTP server
- [packages/usage-dashboard/AGENTS.md](packages/usage-dashboard/AGENTS.md) — Usage dashboard

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
