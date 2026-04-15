# @ank1015/llm-server

Published Node package for the monorepo's Hono backend, project storage model, session orchestration, terminal transport, and installable-skill APIs.

## Status

This package is published as `@ank1015/llm-server` and is also consumed by the `npx @ank1015/llm` launcher.

It is the main backend for the repo's app clients and local session workflows. When run through `npx @ank1015/llm`, the public app and API share the launcher's port (`3210` by default), while the Hono server process runs on a private internal port selected by the launcher.

## Commands

```bash
pnpm --filter @ank1015/llm-server build
pnpm --filter @ank1015/llm-server typecheck
pnpm --filter @ank1015/llm-server lint
pnpm --filter @ank1015/llm-server test
pnpm --filter @ank1015/llm-server test:unit
pnpm --filter @ank1015/llm-server test:integration
pnpm --filter @ank1015/llm-server test:live
pnpm --filter @ank1015/llm-server dev
pnpm --filter @ank1015/llm-server start
pnpm --filter @ank1015/llm-server test-skill -- --prompt "Open the target page"
```

## What It Contains

- Hono route modules for projects, artifact directories, checkpoints, keys, models, sessions, skills, and terminal APIs
- Core services for project/artifact lookup, SDK-backed session persistence, compaction sidecars, and terminal registry state
- HTTP and WebSocket server wiring used by the local desktop and web-facing flows
- Package-local TypeBox contracts and DTOs for the server boundary

## Runtime Defaults

Standalone `pnpm --filter @ank1015/llm-server start` / `node dist/server.js` defaults:

- `HOST` defaults to `127.0.0.1`
- `PORT` defaults to `8001`
- `projectsRoot` defaults to `~/projects`
- `dataRoot` defaults to `~/.llm/projects`

Repo-local callers can override filesystem paths through the internal config module before starting the app or tests.

Packaged `npx @ank1015/llm` defaults:

- public web and API origin: `http://127.0.0.1:3210`
- override with `llm --host <host> --port <port>`
- API requests should use same-origin `/api` routes from the web app instead of assuming `8001`

## Module Map

- `src/app.ts` - Hono app construction and route mounting
- `src/http-server.ts` - Node HTTP server and terminal WebSocket upgrade handling
- `src/server.ts` - local process entrypoint using `HOST` and `PORT`
- `src/routes/` - package HTTP route handlers grouped by resource family
- `src/core/project/` - project metadata and workspace lookup
- `src/core/artifact-dir/` - artifact directory metadata, skill helpers, and temp workspace helpers
- `src/core/session/` - session storage, prompt execution, live run registry, compaction, and context reframing
- `src/core/terminal/` - terminal registry and PTY helpers
- `src/test-skill.ts` - standalone CLI that runs the server agent prompt/tools with appended Chrome docs and exports a Markdown transcript
- `src/contracts/` - route request and response schemas
- `src/types/` - server-local DTO and model types
- `docs/` - package-facing backend notes

## Docs

- `docs/architecture.md` - backend module map and storage layout
- `docs/configuration.md` - runtime host, port, and filesystem configuration
- `docs/testing.md` - unit, integration, and live test guidance

## Notes

- The package is Node-only and requires local filesystem and subprocess access.
- Terminal sessions use `node-pty`; the package includes a Python 3 PTY fallback on Unix-like hosts for specific `posix_spawn` failures.
- Claude credential reload creates a temporary executable wrapper: `.cmd` on Windows, POSIX `sh` elsewhere.
- `test-skill` accepts `--prompt`, optional `--cwd`, and optional `--output`, then writes a conversation-style Markdown transcript after the run finishes.
