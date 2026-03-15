# @ank1015/llm

TypeScript SDK monorepo for multi-provider LLM interactions.

## Commands

```bash
pnpm install          # Install dependencies
pnpm build            # Build all packages
pnpm build:packages   # Build SDK packages only (excludes apps)
pnpm test             # Run all tests
pnpm test:unit        # Run unit tests only
pnpm test:integration # Run integration tests only
pnpm typecheck        # Type-check all packages
pnpm format           # Format all files with Prettier
pnpm format:check     # Check formatting
pnpm lint             # Run ESLint on all packages
pnpm lint:fix         # Auto-fix ESLint issues
pnpm clean            # Remove build artifacts

# Development
pnpm dev:chat-app     # Start chat app

# Production
pnpm start:chat-app   # Start chat app
```

## Architecture

```text
packages/
  types/              # @ank1015/llm-types - Shared contracts and provider type maps
  core/               # @ank1015/llm-core - Stateless runtime built on top of types
  sdk/                # @ank1015/llm-sdk - Opinionated wrappers over core
  sdk-adapters/       # @ank1015/llm-sdk-adapters - Node keys/session adapter implementations
  extension/          # @ank1015/llm-extension
  chat-app/           # @ank1015/llm-chat-app
  usage-dashboard/    # @ank1015/llm-usage-dashboard
  server/             # @ank1015/llm-server
  research/           # @ank1015/llm-research
```

## Package Stack

Bottom up, these are the currently documented base layers:

1. `@ank1015/llm-types`
   Shared contracts package for the monorepo. It defines the normalized message/content model, provider option and native-response type maps, tool/context contracts, agent contracts, adapter/session contracts, and shared errors.
2. `@ank1015/llm-core`
   Stateless runtime built on top of `@ank1015/llm-types`. It owns the model catalog, provider registry, provider implementations, central `stream()` / `complete()` dispatch, shared runtime utilities, and the stateless agent loop.
3. `@ank1015/llm-sdk`
   Opinionated SDK layer on top of `core`. It adds shared credential resolution, stateful `Conversation` flows, and `SessionManager` helpers while staying runtime-neutral and leaving concrete storage implementations out of the package.
4. `@ank1015/llm-sdk-adapters`
   Concrete Node-oriented adapters used by app/server layers. It currently provides file-system and in-memory implementations for keys and sessions, and no longer owns usage tracking or key-management UI code.

More package summaries can be added here as the stack above `types` and `core` is documented.

## Conventions

- Use strict TypeScript
- Export public API explicitly from package `index.ts` files
- Use TypeBox for runtime tool schemas where needed
- Prefer colocated tests or package-local `tests/` directories that mirror source structure
- Use conventional commits, for example `feat(core): add provider`

## Key Files

- `tsconfig.base.json` - Shared TypeScript configuration
- `turbo.json` - Task orchestration
- `eslint.config.js` - Repo-wide linting rules
- `packages/types/src/index.ts` - Contracts package entry
- `packages/core/src/index.ts` - Core runtime entry

## Package Guide

- [packages/types/AGENTS.md](packages/types/AGENTS.md) - Shared contracts layer
- [packages/core/AGENTS.md](packages/core/AGENTS.md) - Stateless runtime layer
- [packages/sdk/AGENTS.md](packages/sdk/AGENTS.md) - Runtime-neutral SDK wrappers, credential resolution, and session helpers
- [packages/sdk-adapters/AGENTS.md](packages/sdk-adapters/AGENTS.md) - Concrete Node file-system and in-memory keys/session adapters

## Boundaries

Never:

- commit secrets or API keys
- bypass TypeScript strictness without a clear reason
- publish packages without checking their package-local docs, build, and release surface

Ask first:

- adding new dependencies
- changing build or publish configuration
- creating new packages

Freely:

- improve docs
- add tests
- refactor within existing package boundaries
