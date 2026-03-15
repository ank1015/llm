# @ank1015/llm-server

Node-only Hono orchestration server for projects, artifact directories, agent sessions, and bundled skills.

## Commands

- `pnpm build` — Clean and compile TypeScript into `dist/`
- `pnpm dev` — Rebuild on change and run the HTTP server
- `pnpm start` — Run the compiled server from `dist/server.js`
- `pnpm test` — Run unit and integration suites
- `pnpm test:unit` — Run unit tests under `tests/unit`
- `pnpm test:integration` — Run HTTP/app integration tests under `tests/integration`
- `pnpm test:coverage` — Run the full suite with coverage
- `pnpm typecheck` — Type-check the package without emitting
- `pnpm lint` — Lint source, tests, and config files
- `pnpm clean` — Remove build artifacts and coverage output

## Structure

- `src/index.ts` — Package entry; exports `createApp` and `app`
- `src/app.ts` — Hono app factory, CORS wiring, and route mounting
- `src/server.ts` — Node HTTP entry point
- `src/core/config.ts` — Internal path configuration defaults for projects and metadata
- `src/core/project/project.ts` — Project lifecycle and metadata persistence
- `src/core/artifact-dir/artifact-dir.ts` — Artifact directory lifecycle, file APIs, and artifact-local skills
- `src/core/session/session.ts` — Session runtime, persistence, prompt flows, and stream/edit/retry behavior
- `src/core/session/run-registry.ts` — Live SSE run registry and replay buffer
- `src/core/session/credential-utils.ts` — Internal helpers for reloadable Codex and Claude Code credentials
- `src/core/skills.ts` — Thin wrappers around bundled skills from `@ank1015/llm-agents`
- `src/core/storage/fs.ts` — Shared filesystem helpers
- `src/core/types.ts` — Domain types for projects, artifacts, sessions, and prompt inputs
- `src/core/utils.ts` — Provider-option shaping from reasoning level
- `src/routes/` — HTTP handlers for projects, artifact dirs, sessions, and bundled skills
- `tests/unit/` — Domain and regression tests with mocked agent/runtime dependencies
- `tests/integration/` — App and route tests using `app.request()`
- `docs/` — Package docs and API reference

## Conventions

- Keep the package Node-only and filesystem-backed.
- Preserve the split between working directories and metadata directories.
- Treat `Session` plus `run-registry` as the core runtime; route files should stay thin.
- Keep `credential-utils.ts` internal; document it, but do not turn it into a public root export by accident.
- The source of truth for bundled skills is `@ank1015/llm-agents`; server tests and docs should mirror that package’s current skill set.
- Prefer updating tests and docs when route behavior changes instead of leaving stale expectations behind.

## Package Role

- Uses `@ank1015/llm-agents` for tools, prompt construction, and bundled skill installation
- Uses `@ank1015/llm-sdk` for conversations, models, and message/session types
- Uses `@ank1015/llm-sdk-adapters` for file-backed keys and session persistence
- Exposes a stable HTTP API for project/artifact/session orchestration and SSE run streaming
