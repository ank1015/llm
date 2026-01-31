# @ank1015/llm-server

HTTP server for LLM SDK built with Hono.

## Commands

- `pnpm build` — Compile TypeScript to dist/
- `pnpm dev` — Run dev server with hot reload (tsx)
- `pnpm start` — Run production server
- `pnpm test` — Run tests with Vitest
- `pnpm typecheck` — Type-check without emitting

## Structure

```
src/
  index.ts              — Server entry point and app export
```

## Key Exports

- `app` — Hono application instance

## Conventions

- Use Hono for routing and middleware
- Export app for testing and composition
- Keep routes in separate files as the app grows

## Dependencies

- Depends on: @ank1015/llm-core, @ank1015/llm-types
- Depended on by: (none yet)
