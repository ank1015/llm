# @ank1015/llm-gateway

Node-only Hono gateway that stores provider credentials server-side, proxies `@ank1015/llm-core` chat/image calls, and persists sanitized request logs to SQLite.

## Commands

```bash
pnpm --filter @ank1015/llm-gateway build
pnpm --filter @ank1015/llm-gateway typecheck
pnpm --filter @ank1015/llm-gateway lint
pnpm --filter @ank1015/llm-gateway test
pnpm --filter @ank1015/llm-gateway test:unit
pnpm --filter @ank1015/llm-gateway test:integration
pnpm --filter @ank1015/llm-gateway start
```

## Module Map

- `src/index.ts` - package root exports for app creation, server creation, and config loading
- `src/app.ts` - Hono app assembly and route registration
- `src/server.ts` - standalone Node server bootstrap
- `src/config.ts` - environment parsing and typed gateway config
- `src/routes/` - health, llm, image, auth, dashboard, and admin routes
- `src/middleware/` - request id, sender auth, and admin auth middleware
- `src/db/` - SQLite bootstrap, schema migration, and typed access helpers
- `src/auth/` - password hashing, admin sessions, JWT access tokens, and rotating refresh tokens
- `src/vault/` - encrypted provider key storage and in-memory cache
- `src/logging/` - payload redaction and request/event persistence
- `src/proxy/` - core runtime bridging for chat streams and image requests
- `src/contracts/` - TypeBox route envelopes
- `tests/unit/` - focused helper and auth coverage
- `tests/integration/` - mounted app coverage with mocked core transport

## Conventions

- Keep the gateway thin and core-shaped: accept raw `api`, `modelId`, `messages`, `tools`, `images`, and `providerOptions`.
- Never return stored provider credentials or persist secrets/raw base64 payloads in SQLite logs.
- Keep user signup admin-approved: dashboard/admin API creates users, and users only log in after that.
- Prefer the single-API-key provider path in this package; do not add provider-specific multi-secret auth flows unless the product explicitly needs them.
- Prefer direct Hono handlers, small helper modules, and prepared SQLite statements over framework-heavy abstractions.
- When route contracts change, update both `src/contracts/` and the matching tests in the same change.
- Treat live-provider coverage as a follow-up concern; default package validation stays local and deterministic.
