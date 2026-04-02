# @ank1015/llm-server

Private workspace package for the monorepo's Hono backend, project storage model, session orchestration, terminal transport, and installable-skill APIs.

## Status

This package is workspace-only and is not intended to be published to npm.

It is the main backend for the repo's app clients and local session workflows.

## Commands

```bash
pnpm --filter @ank1015/llm-server build
pnpm --filter @ank1015/llm-server typecheck
pnpm --filter @ank1015/llm-server lint
pnpm --filter @ank1015/llm-server test
pnpm --filter @ank1015/llm-server test:unit
pnpm --filter @ank1015/llm-server test:integration
pnpm --filter @ank1015/llm-server test:live
pnpm --filter @ank1015/llm-server start
```

## What It Contains

- Hono route modules for projects, artifact directories, checkpoints, keys, models, sessions, skills, and terminal APIs
- Core services for project/artifact lookup, SDK-backed session persistence, compaction sidecars, and terminal registry state
- HTTP and WebSocket server wiring used by the local desktop and web-facing flows
- Package-local TypeBox contracts and DTOs for the server boundary

## Runtime Defaults

- `HOST` defaults to `127.0.0.1`
- `PORT` defaults to `8001`
- `projectsRoot` defaults to `~/projects`
- `dataRoot` defaults to `~/.llm/projects`

Repo-local callers can override filesystem paths through the internal config module before starting the app or tests.

## Module Map

- `src/app.ts` - Hono app construction and route mounting
- `src/http-server.ts` - Node HTTP server and terminal WebSocket upgrade handling
- `src/server.ts` - local process entrypoint using `HOST` and `PORT`
- `src/routes/` - package HTTP route handlers grouped by resource family
- `src/core/project/` - project metadata and workspace lookup
- `src/core/artifact-dir/` - artifact directory metadata, skill helpers, and temp workspace helpers
- `src/core/session/` - session storage, prompt execution, live run registry, compaction, and context reframing
- `src/core/terminal/` - terminal registry and PTY helpers
- `src/contracts/` - route request and response schemas
- `src/types/` - server-local DTO and model types
- `docs/` - package-facing backend notes

## Docs

- `docs/architecture.md` - backend module map and storage layout
- `docs/configuration.md` - runtime host, port, and filesystem configuration
- `docs/testing.md` - unit, integration, and live test guidance

## Notes

- This package is intentionally private even though it has a clean package manifest and exported entrypoints for workspace consumers.
- The current package-level lint command still has outstanding source warnings and errors; the docs here describe the package as it exists today without changing runtime behavior.
