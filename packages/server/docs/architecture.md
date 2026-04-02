# Server Architecture

The server package is the monorepo's private backend layer. It exposes a Hono app, a Node HTTP server wrapper, and a set of filesystem-backed resource managers that coordinate projects, artifacts, sessions, skills, and terminals.

## Main Entry Points

- `src/app.ts` creates the Hono application and mounts all `/api` route groups.
- `src/http-server.ts` wraps the Hono app in a Node server and handles terminal WebSocket upgrades.
- `src/server.ts` is the local runtime entrypoint used by `pnpm --filter @ank1015/llm-server start`.
- `src/index.ts` exports `createApp()`, `createHttpServer()`, and the default app instance for workspace consumers.

## Route Groups

- `routes/projects.ts` manages project creation and listing
- `routes/artifact-dirs.ts` handles artifact directory metadata and file/resource helpers
- `routes/checkpoints.ts` exposes git-backed artifact checkpoint workflows
- `routes/keys.ts` manages the shared SDK keystore through HTTP
- `routes/models.ts` exposes curated model metadata
- `routes/sessions.ts` handles session creation, prompt execution, SSE streaming, and rename flows
- `routes/skills.ts` exposes installable skill registry endpoints
- `routes/terminals.ts` manages interactive terminal creation and attachment metadata

## Core Modules

- `core/project/` stores and resolves project metadata
- `core/artifact-dir/` owns artifact metadata, installed skill helpers, ignore rules, and temp workspace setup
- `core/session/` owns SDK-backed session files, live-run attachment, turn compaction sidecars, and context reframing
- `core/terminal/` manages PTY-backed terminals and replay buffers
- `core/storage/fs.ts` contains the shared filesystem helpers used by the backend services

## Storage Layout

By default the package keeps working directories and metadata in separate roots:

- project workspaces: `~/projects`
- server metadata: `~/.llm/projects`

Within the metadata root, project and artifact records are organized under the project id, with artifact-local session files, checkpoint state, and terminal/session side data stored underneath that project tree.

## Related Packages

- `@ank1015/llm-sdk` provides the underlying keys/session abstractions used by session routes
- `@ank1015/llm-agents` provides prompt helpers, skill registry support, and agent-side workflows consumed by the server
- `@ank1015/llm-app-contracts` is the shared DTO layer used by app clients talking to this backend
