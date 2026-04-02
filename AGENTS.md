# @ank1015/llm

TypeScript SDK monorepo for multi-provider LLM interactions.

## Commands

```bash
pnpm install          # Install dependencies
pnpm build            # Build all packages
pnpm build:packages   # Build SDK/agent packages only (excludes apps)
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
pnpm dev:native-app   # Start the Expo native app
pnpm dev:web-app      # Start the web app

# Production
pnpm start:web-app    # Start the web app
```

## Architecture

```text
packages/
  types/              # @ank1015/llm-types - Shared contracts and provider type maps
  app-contracts/      # @ank1015/llm-app-contracts - Shared HTTP DTOs and schemas for server/app clients
  core/               # @ank1015/llm-core - Stateless runtime built on top of types
  sdk/                # @ank1015/llm-sdk - Opinionated wrappers over core
  sdk-adapters/       # @ank1015/llm-sdk-adapters - Node keys/session adapter implementations
  agents/             # @ank1015/llm-agents - General-purpose agent tools, system prompts, and skill-registry helpers
  extension/          # @ank1015/llm-extension - Chrome RPC bridge
  native-app/         # @ank1015/llm-native-app - Expo mobile client for the server
  web-app/            # @ank1015/llm-web-app - Next.js web client for the server
  usage-dashboard/    # @ank1015/llm-usage-dashboard
  server/             # @ank1015/llm-server
  research/           # @ank1015/llm-research
```

## Package Stack

Bottom up, these are the currently documented base layers:

1. `@ank1015/llm-types`
   Shared contracts package for the monorepo. It defines the normalized message/content model, provider option and native-response type maps, tool/context contracts, agent contracts, adapter/session contracts, and shared errors.
2. `@ank1015/llm-app-contracts`
   Shared HTTP contract layer for the app/server boundary. It defines the public DTOs, request/query schemas, and SSE payload shapes used between `@ank1015/llm-server` and the app clients.
3. `@ank1015/llm-core`
   Stateless runtime built on top of `@ank1015/llm-types`. It owns the model catalog, provider registry, provider implementations, central `stream()` / `complete()` dispatch, shared runtime utilities, and the stateless agent loop.
4. `@ank1015/llm-sdk`
   Opinionated SDK layer on top of `core`. It adds shared credential resolution, stateful `Conversation` flows, and `SessionManager` helpers while staying runtime-neutral and leaving concrete storage implementations out of the package.
5. `@ank1015/llm-sdk-adapters`
   Concrete Node-oriented adapters used by app/server layers. It currently provides file-system and in-memory implementations for keys and sessions, and no longer owns usage tracking or key-management UI code.
6. `@ank1015/llm-agents`
   Node-only general-purpose agent package built on top of the sdk stack. It owns the monorepo's filesystem/shell tool layer, system prompt construction, and the skill-registry helpers used by the server stack.
7. `@ank1015/llm-extension`
   Independent Chrome RPC package. It provides the Manifest V3 extension, native messaging host, TCP bridge, and Node client used to call Chrome APIs and debugger helpers from local processes.
8. `@ank1015/llm-server`
   Node-only Hono orchestration server built on top of the SDK and agents layers. It manages projects, artifact directories, agent sessions, installable skills, and SSE-backed live session runs over a filesystem-backed workspace model.
9. `@ank1015/llm-web-app`
   Private Next.js web client for the server stack. It consumes `@ank1015/llm-app-contracts` through a local `client-api` layer and provides the projects, artifacts, sessions, and streaming conversation UI.
10. `@ank1015/llm-native-app`
    Private Expo mobile client for the same server/app-contracts boundary. It ships the Folders mobile UI, native artifact/thread flows, and mobile-specific state management on top of `@ank1015/llm-server`.

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
- [packages/app-contracts/AGENTS.md](packages/app-contracts/AGENTS.md) - Shared HTTP DTOs and TypeBox schemas for server/app clients
- [packages/core/AGENTS.md](packages/core/AGENTS.md) - Stateless runtime layer
- [packages/sdk/AGENTS.md](packages/sdk/AGENTS.md) - Runtime-neutral SDK wrappers, credential resolution, and session helpers
- [packages/sdk-adapters/AGENTS.md](packages/sdk-adapters/AGENTS.md) - Concrete Node file-system and in-memory keys/session adapters
- [packages/agents/AGENTS.md](packages/agents/AGENTS.md) - General-purpose agent tools, system prompts, and skill-registry helpers
- [packages/extension/AGENTS.md](packages/extension/AGENTS.md) - Chrome RPC bridge, native host, and Node client
- [packages/native-app/AGENTS.md](packages/native-app/AGENTS.md) - Expo mobile client for projects, artifacts, sessions, and streaming conversation
- [packages/web-app/AGENTS.md](packages/web-app/AGENTS.md) - Next.js web client for projects, artifacts, sessions, and streaming conversation
- [packages/server/AGENTS.md](packages/server/AGENTS.md) - Node-only orchestration server for projects, artifact directories, sessions, and skills

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
