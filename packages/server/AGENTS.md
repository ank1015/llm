# @ank1015/llm-server

Hono-based HTTP server for LLM interactions.

## Commands

- `pnpm build` — Compile TypeScript to dist/
- `pnpm dev` — Watch mode compilation
- `pnpm start` — Start the server (requires build first)
- `pnpm test` — Run all tests
- `pnpm test:watch` — Run tests in watch mode
- `pnpm typecheck` — Type-check without emitting

## Structure

- `src/index.ts` — Hono app and route definitions (public export)
- `src/server.ts` — Entry point that starts the HTTP server
- `tests/` — Test files

## Conventions

- Routes are defined on the exported `app` instance in `src/index.ts`
- Use `app.request()` in tests (no need to start the server)
- Server port configurable via `PORT` env var (default: 3001)

## Dependencies

- Depends on: (none yet)
- Depended on by: (none yet)
