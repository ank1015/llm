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
- `src/app.ts` — Hono app factory, wires deps together
- `src/main.ts` — Server entry point (connects Chrome, starts cron, serves)
- `src/db/` — Database layer
  - `index.ts` — `createDb()` SQLite initialization + migrations
  - `x-posts.repository.ts` — x_posts table CRUD (insert, findAll, count)
- `src/routes/` — HTTP route modules
  - `x.ts` — `/x/feed` (GET paginated), `/x/feed/fetch` (POST trigger)
- `src/jobs/` — Background job modules
  - `index.ts` — `startJobs()` / `stopJobs()` orchestrator
  - `x-feed.job.ts` — Fetch X feed posts and save to DB
- `tests/` — Test files mirroring src structure

## Conventions

- Use `createApp(deps)` factory for testability — tests use in-memory SQLite and mock XSource
- Route modules receive dependencies via factory functions, not globals
- Jobs separate logic (job files) from scheduling (index.ts)
- Tests use `app.request()` directly without starting a server

## Dependencies

- Depends on: `@ank1015/llm-extension`, `@ank1015/llm-research`
- Depended on by: (none yet)
