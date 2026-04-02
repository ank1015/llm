# @ank1015/llm-web-app

Private Next.js client for browsing projects, opening artifacts, streaming sessions, managing keys, and attaching terminals against the local `@ank1015/llm-server` backend.

## Status

This app is workspace-only and is not intended to be published to npm.

It talks to the server backend over HTTP and WebSocket APIs, defaulting to `http://localhost:8001`.

## Commands

From the repo root:

```bash
pnpm dev:web-app
pnpm start:web-app
pnpm --filter @ank1015/llm-web-app build
pnpm --filter @ank1015/llm-web-app typecheck
pnpm --filter @ank1015/llm-web-app lint
pnpm --filter @ank1015/llm-web-app test
```

From the app directory:

```bash
pnpm --dir apps/web dev
pnpm --dir apps/web build
pnpm --dir apps/web typecheck
pnpm --dir apps/web lint
pnpm --dir apps/web test
```

## Environment

- `NEXT_PUBLIC_LLM_SERVER_BASE_URL` overrides the default backend URL
- default server URL: `http://localhost:8001`
- terminal sockets are derived from the same base URL

## What It Contains

- project browser and archive views
- project workspace layout with artifact file browsing
- artifact chat/session UI with SSE streaming
- terminal panel with WebSocket-backed shells
- key and model selection flows backed by the server contracts
- local Zustand stores and React Query hooks for app state

## Module Map

- `src/app/` - App Router entrypoints for the home screen and project-scoped pages
- `src/components/` - project shell, artifact workspace, chat, terminal, and UI building blocks
- `src/lib/client-api/` - typed HTTP and WebSocket client layer over `@ank1015/llm-server`
- `src/hooks/api/` - React Query hooks around the client-api layer
- `src/stores/` - Zustand stores for sessions, terminals, composer state, and UI state
- `src/lib/messages/` - chat formatting, mentions, and working-trace helpers
- `tests/unit/` - unit coverage for client-api helpers, stores, hooks, and major UI components

## Docs

- `docs/architecture.md` - high-level UI and data-flow map
- `docs/testing.md` - package-local validation commands and test coverage notes

## Notes

- This app is wired into the repo workspace as `@ank1015/llm-web-app`, so the root `dev:web-app` and `start:web-app` scripts target the real package.
- The current app lint run is green but still emits a few warnings; those are left as-is in this cleanup pass.
