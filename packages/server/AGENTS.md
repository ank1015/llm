# @ank1015/llm-server

Hono-based HTTP server for the LLM platform.

## Commands

- `pnpm build` — Compile TypeScript
- `pnpm dev` — Watch mode compilation
- `pnpm start` — Run the compiled server
- `pnpm test` — Run tests
- `pnpm test:watch` — Run tests in watch mode
- `pnpm typecheck` — Type-check without emitting

## Structure

- `src/index.ts` — Public exports
- `src/app.ts` — Hono app factory
- `src/main.ts` — Server entry point (node-server)

## Conventions

- Use `createApp()` factory for testability — tests call `app.request()` directly without starting a server
- Add routes in `src/app.ts` or split into route modules as the server grows

## Dependencies

- Depends on: (none yet)
- Depended on by: (none yet)
