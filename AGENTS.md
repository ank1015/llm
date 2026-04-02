# @ank1015/llm

TypeScript monorepo for the local LLM runtime, SDK, agents layer, server backend, and web client.

## Commands

```bash
pnpm install          # Install workspace dependencies
pnpm build            # Build all workspace packages and apps
pnpm build:packages   # Build core/sdk/agents/server only
pnpm test             # Run all package/app test commands
pnpm test:unit        # Run unit test commands across the workspace
pnpm test:integration # Run integration test commands across the workspace
pnpm typecheck        # Type-check all workspace projects
pnpm lint             # Lint apps, packages, scripts, and root config files
pnpm lint:fix         # Auto-fix lint issues where possible
pnpm format           # Format the repo with Prettier
pnpm format:check     # Check formatting
pnpm clean            # Remove workspace build artifacts and root node_modules

# Development
pnpm dev              # Run workspace dev tasks through Turbo
pnpm dev:web-app      # Start the Next.js web client
pnpm start:web-app    # Start the built web client
```

## Architecture

```text
apps/
  web/                # @ank1015/llm-web-app - Next.js client for the server

packages/
  core/               # @ank1015/llm-core - Stateless provider runtime and model catalog
  sdk/                # @ank1015/llm-sdk - Credential-backed LLM and agent helpers
  agents/             # @ank1015/llm-agents - Agent tools, prompts, and skill registry helpers
  server/             # @ank1015/llm-server - Hono backend for projects, artifacts, sessions, and terminals
```

## Package Stack

1. `@ank1015/llm-core`
   Stateless runtime built around curated models, provider registration, `llm()` dispatch, and the agent loop foundation.
2. `@ank1015/llm-sdk`
   Opinionated layer over core for key resolution, session persistence, `llm()`, and `agent()` flows.
3. `@ank1015/llm-agents`
   General-purpose tool and prompt layer used by the server and agent-oriented workflows.
4. `@ank1015/llm-server`
   Private Hono backend for project storage, artifact APIs, sessions, skills, checkpoints, and terminals.
5. `@ank1015/llm-web-app`
   Private Next.js client for browsing projects and artifacts, streaming sessions, and terminal interaction.

## Conventions

- Use strict TypeScript.
- Export public package APIs explicitly from `src/index.ts`.
- Keep package-local `README.md` and `AGENTS.md` files current when commands or structure change.
- Prefer package-local tests under `tests/` or colocated with the feature they cover.
- Use conventional commits, for example `feat(core): add provider`.

## Key Files

- `package.json` - Root workspace scripts
- `pnpm-workspace.yaml` - Workspace package/app discovery
- `turbo.json` - Task orchestration
- `eslint.config.js` - Repo-wide lint rules and exceptions
- `tsconfig.base.json` - Shared TypeScript defaults
- `packages/core/src/index.ts` - Core runtime entry
- `packages/sdk/src/index.ts` - SDK public entry
- `packages/server/src/index.ts` - Server app/server entry
- `apps/web/src/app/page.tsx` - Web app home route

## Package Guide

- [packages/core/AGENTS.md](packages/core/AGENTS.md) - Stateless runtime layer
- [packages/sdk/AGENTS.md](packages/sdk/AGENTS.md) - SDK wrappers, keys, and sessions
- [packages/agents/AGENTS.md](packages/agents/AGENTS.md) - Agent tools, prompts, and registry helpers
- [packages/server/AGENTS.md](packages/server/AGENTS.md) - Backend routes, storage, sessions, and terminals
- [apps/web/AGENTS.md](apps/web/AGENTS.md) - Next.js web client for projects, artifacts, sessions, and terminals

## Boundaries

Never:

- commit secrets or API keys
- change publish or release behavior without checking package-local docs first
- delete user work or generated outputs you did not understand first

Ask first:

- adding new dependencies
- changing build or release policy
- introducing new packages or apps

Freely:

- improve docs and root metadata
- add or update tests
- remove stale scripts and references that no longer match the checked-in workspace
