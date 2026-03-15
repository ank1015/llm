# @ank1015/llm-server

Node-only Hono orchestration server for managing projects, artifact directories, agent sessions, bundled skills, and SSE-powered session runs.

## What It Does

- Creates and manages project workspaces
- Separates agent-visible working directories from hidden metadata/session storage
- Runs LLM-backed sessions inside artifact directories using `@ank1015/llm-agents`
- Streams live agent runs over SSE with replay and cancellation support
- Installs bundled artifact-local skills from `@ank1015/llm-agents`
- Publishes intentional HTTP DTOs and request/query validation through `@ank1015/llm-app-contracts`

## Runtime Model

The server is built around three domain objects:

- `Project` — top-level workspace container
- `ArtifactDir` — a scoped working directory inside a project
- `Session` — an agent conversation persisted under one artifact directory

Working directories live under `~/projects` by default. Metadata and session history live under `~/.llm/projects`, so the agent sees a clean workspace while the server keeps metadata, trees, and session logs out of band.

## Public Package Surface

The root package exports:

- `createApp()` — create a configured Hono app instance
- `app` — a default app instance

The packaged Node entry point is `dist/server.js`, which starts the HTTP server with the default configuration.

## Defaults

- `projectsRoot`: `~/projects`
- `dataRoot`: `~/.llm/projects`
- `HOST`: `127.0.0.1`
- `PORT`: `8001`
- `CORS_ORIGIN`: `*`

## Quick Start

Build and run the server from the package:

```bash
pnpm --filter @ank1015/llm-server build
pnpm --filter @ank1015/llm-server start
```

Health check:

```bash
curl http://127.0.0.1:8001/health
```

Expected response:

```json
{ "status": "ok" }
```

## Commands

- `pnpm --filter @ank1015/llm-server build`
- `pnpm --filter @ank1015/llm-server dev`
- `pnpm --filter @ank1015/llm-server start`
- `pnpm --filter @ank1015/llm-server test`
- `pnpm --filter @ank1015/llm-server test:unit`
- `pnpm --filter @ank1015/llm-server test:integration`
- `pnpm --filter @ank1015/llm-server test:coverage`
- `pnpm --filter @ank1015/llm-server typecheck`
- `pnpm --filter @ank1015/llm-server lint`

## Docs

- [docs/README.md](./docs/README.md) — docs index
- [docs/architecture.md](./docs/architecture.md) — project/artifact/session model and session runtime
- [docs/configuration.md](./docs/configuration.md) — defaults, env vars, and credential expectations
- [docs/testing.md](./docs/testing.md) — validation commands and test layout
- [docs/api/README.md](./docs/api/README.md) — HTTP API reference

## Notes

- This package is intentionally Node-only.
- Credential resolution uses the file-backed keys flow from `@ank1015/llm-sdk-adapters`.
- Reloadable Codex and Claude Code credential helpers exist in the internal core layer and are documented for maintainers, not as separate public APIs.
