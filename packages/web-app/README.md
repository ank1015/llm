# @ank1015/llm-web-app

Private Next.js web client for `@ank1015/llm-server`.

## What It Is

- Server-backed web app for projects, artifact directories, sessions, artifact file browsing, and streamed conversation
- Uses `@ank1015/llm-app-contracts` through the local `client-api` layer
- Keeps transport and UI state in-package; it does not own local `/api/*` routes

## Commands

- `pnpm --filter @ank1015/llm-web-app dev`
- `pnpm --filter @ank1015/llm-web-app build`
- `pnpm --filter @ank1015/llm-web-app start`
- `pnpm --filter @ank1015/llm-web-app lint`
- `pnpm --filter @ank1015/llm-web-app typecheck`
- `pnpm --filter @ank1015/llm-web-app test`
- `pnpm --filter @ank1015/llm-web-app test:coverage`

## Runtime Configuration

- `NEXT_PUBLIC_LLM_SERVER_BASE_URL` — base URL for `@ank1015/llm-server`
- default local fallback: `http://localhost:8001`

## Structure

- `src/app/` — App Router pages and layouts
- `src/lib/client-api/` — typed HTTP wrapper around the server API
- `src/stores/` — Zustand state for chat, sessions, sidebar, and artifact files
- `src/components/` — UI and streaming/chat components
- `docs/` — package docs
- `tests/unit/` — Vitest coverage for client-api, stores, and a small render smoke test

## Docs

- [docs/README.md](./docs/README.md)
- [docs/architecture.md](./docs/architecture.md)
- [docs/configuration.md](./docs/configuration.md)
- [docs/testing.md](./docs/testing.md)
