# @ank1015/llm-server

Private workspace package for the monorepo's Hono backend, session orchestration, artifact storage APIs, and terminal transport.

## Commands

```bash
pnpm --filter @ank1015/llm-server build
pnpm --filter @ank1015/llm-server typecheck
pnpm --filter @ank1015/llm-server lint
pnpm --filter @ank1015/llm-server test
pnpm --filter @ank1015/llm-server test:unit
pnpm --filter @ank1015/llm-server test:integration
pnpm --filter @ank1015/llm-server test:live
pnpm --filter @ank1015/llm-server start
pnpm --filter @ank1015/llm-server test-skill -- --prompt "Open the target page"
```

## Module Map

- `src/index.ts` - package root exports for app creation and HTTP server wiring
- `src/app.ts` - Hono app assembly and route registration
- `src/http-server.ts` - Node HTTP server plus terminal WebSocket upgrades
- `src/routes/` - projects, artifacts, checkpoints, keys, models, sessions, skills, and terminals
- `src/core/project/` - project creation and lookup
- `src/core/artifact-dir/` - artifact metadata, skill catalog helpers, temp workspace helpers, and ignore rules
- `src/core/session/` - SDK-backed sessions, run registry, compaction helpers, and context reframing
- `src/core/terminal/` - PTY process management and attachment registry
- `src/test-skill.ts` - standalone CLI for running the server agent prompt/tools with appended Chrome docs and exporting a Markdown transcript
- `src/contracts/` - TypeBox request and response contracts for route handlers
- `src/http/` - contract adapters and schema validation helpers
- `tests/unit/` - route, core, and HTTP helper coverage
- `tests/integration/` - mounted app and session integration coverage
- `tests/live/` - opt-in live-provider session coverage

## Conventions

- Keep this package workspace-only. Do not add npm-release workflows or public-package artifacts back unless the package direction changes.
- When a route contract changes, update both `src/contracts/` and the route tests in the same change.
- Keep `docs/` aligned with the actual server defaults, especially host, port, keystore, and filesystem paths.
- Treat `tests/live/` as opt-in local verification; avoid making routine package validation depend on live credentials.
- Prefer package-local docs for backend behavior instead of scattering server workflow notes across the monorepo root.
