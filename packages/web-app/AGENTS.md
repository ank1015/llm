# @ank1015/llm-web-app

Private Next.js web client for projects, artifacts, sessions, and streamed conversation backed by `@ank1015/llm-server`.

## Commands

- `pnpm dev` — start the Next.js dev server
- `pnpm build` — build the app
- `pnpm start` — run the production build
- `pnpm lint` — lint source and tests
- `pnpm typecheck` — run TypeScript without emitting
- `pnpm test` — run unit/smoke tests
- `pnpm test:coverage` — run tests with coverage

## Structure

- `src/app/` — App Router routes for projects, artifacts, threads, and artifact browsing
- `src/lib/client-api/` — typed wrapper around the server API using `@ank1015/llm-app-contracts`
- `src/stores/` — Zustand stores for chat, sessions, sidebar state, composer state, and artifact files
- `src/components/` — UI shell, chat components, markdown/code rendering, and artifact viewers
- `docs/` — package docs
- `tests/unit/` — package-local Vitest coverage

## Conventions

- Keep this package server-backed; do not reintroduce internal `/api/*` ownership.
- Prefer updating `client-api` and shared contracts before adding app-local response types.
- Keep store tests lightweight and deterministic.
- For raw artifact images and markdown-rendered images, use narrow eslint suppressions instead of forcing `next/image` where the source is dynamic.
- Treat this as a private repo app, not an npm package.

## Package Role

- Depends on `@ank1015/llm-server` as the runtime backend
- Uses `@ank1015/llm-app-contracts` as the source of truth for request/response/SSE types
- Uses `@ank1015/llm-core` only for local model metadata helpers used by the UI
