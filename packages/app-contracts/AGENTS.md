# @ank1015/llm-app-contracts

Shared app/server HTTP contracts for `@ank1015/llm`.

## Commands

- `pnpm build` — Compile TypeScript into `dist/`
- `pnpm typecheck` — Type-check without emitting
- `pnpm test` — Run contract schema tests
- `pnpm test:coverage` — Run tests with coverage
- `pnpm lint` — Lint source and tests

## Structure

- `src/common.ts` — shared error envelopes, enums, and shallow SDK payload schemas
- `src/projects.ts` — project DTOs, overview DTOs, and file-index contracts
- `src/artifacts.ts` — artifact DTOs, explorer/file contracts, and path mutation contracts
- `src/sessions.ts` — session DTOs, prompt/request contracts, and tree/history contracts
- `src/skills.ts` — bundled and installed skill DTOs
- `src/streaming.ts` — live-run and SSE event contracts
- `src/index.ts` — public barrel
- `tests/` — focused schema/DTO validation tests

## Conventions

- This package models the external HTTP API only.
- Do not move server-internal metadata or filesystem implementation details here.
- Prefer intentional DTO names like `ProjectDto` instead of reusing internal server model names.
- Use TypeBox schemas plus inferred types for app-owned payloads.
- Embedded SDK payloads may use shallow schemas when deep runtime validation is not practical.

## Boundaries

Never:

- add fetch clients or environment-specific transport helpers
- expose server-internal filesystem paths or metadata storage shapes
- depend on `@ank1015/llm-server`

Freely:

- add DTOs and request/query schemas
- refine shallow envelope schemas
- improve test coverage for boundary contracts
