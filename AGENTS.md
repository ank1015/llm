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
pnpm format           # Format all files with Prettier
pnpm format:check     # Check formatting (CI)
pnpm lint             # Run ESLint on all packages
pnpm lint:fix         # Auto-fix ESLint issues
pnpm clean            # Remove all build artifacts

# Development
pnpm dev:chat-app     # Start chat app (port 3000)
pnpm dev:dashboard    # Start dashboard (port 3000)

# Production
pnpm start:chat-app   # Start chat app
pnpm start:dashboard  # Start dashboard
```

## Architecture

```
packages/
  types/              # @ank1015/llm-types - Shared type definitions
  core/               # @ank1015/llm-core - Core SDK (stateless, portable)
  sdk/                # @ank1015/llm-sdk - Unified SDK (portable, adapter interfaces)
  sdk-adapters/       # @ank1015/llm-sdk-adapters - Node.js adapter implementations
  extension/          # @ank1015/llm-extension - Chrome extension + native messaging host
  chat-app/           # @ank1015/llm-chat-app - Next.js chat application
  usage-dashboard/    # @ank1015/llm-usage-dashboard - Next.js usage dashboard
  research/           # @ank1015/llm-research - Research utilities
```

## Conventions

- Use strict TypeScript (see tsconfig.base.json)
- Export types explicitly from index.ts
- Use Zod for runtime validation
- Tests colocated as `*.test.ts`
- Conventional commits: `feat(core): add feature`
- Pre-commit hooks auto-format, lint, and typecheck staged files

## Key Files

- `tsconfig.base.json` — Shared TypeScript configuration
- `turbo.json` — Task orchestration
- `.prettierrc` — Code formatting (applies to all packages)
- `eslint.config.js` — Linting rules (applies to all packages)
- `packages/core/src/index.ts` — Core package entry

## Package Guide

- [packages/types/AGENTS.md](packages/types/AGENTS.md) — Type definitions
- [packages/core/AGENTS.md](packages/core/AGENTS.md) — Core SDK (stateless)
- [packages/sdk/AGENTS.md](packages/sdk/AGENTS.md) — Unified SDK (portable)
- [packages/sdk-adapters/AGENTS.md](packages/sdk-adapters/AGENTS.md) — Node.js adapter implementations
- [packages/extension/AGENTS.md](packages/extension/AGENTS.md) — Chrome extension + native messaging host
- [packages/chat-app/AGENTS.md](packages/chat-app/AGENTS.md) — Chat application
- [packages/usage-dashboard/AGENTS.md](packages/usage-dashboard/AGENTS.md) — Usage dashboard
- [packages/research/AGENTS.md](packages/research/AGENTS.md) — Research utilities

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
