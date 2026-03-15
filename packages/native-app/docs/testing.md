# Testing

## Commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
```

## Current test scope

This package keeps tests lightweight and deterministic:

- `client-api/http.ts`
  server base URL resolution and error handling
- `client-api/conversation.ts`
  SSE parsing and stream conflict handling
- Zustand stores
  project, sidebar, session, and chat-settings logic

Component render tests are intentionally deferred in this package. The first goal is reliable
logic/state coverage and stable package health checks.
