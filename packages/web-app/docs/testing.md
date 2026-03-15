# Testing

## Commands

- `pnpm --filter @ank1015/llm-web-app lint`
- `pnpm --filter @ank1015/llm-web-app typecheck`
- `pnpm --filter @ank1015/llm-web-app build`
- `pnpm --filter @ank1015/llm-web-app test`
- `pnpm --filter @ank1015/llm-web-app test:coverage`

## Covered Areas

- `client-api` request URL construction, SSE parsing, and conflict handling
- key Zustand store behavior for chat settings, sessions, and sidebar updates
- one small DTO-driven render smoke test

## Out of Scope

- no browser e2e coverage in this package
- no local API-route integration tests, since this app is server-backed
