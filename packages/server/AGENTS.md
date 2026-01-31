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
  services/
    index.ts            — Service exports
    keys.ts             — API key management (encrypted storage)
    db.ts               — SQLite database for usage tracking
```

## Key Exports

- `app` — Hono application instance
- `KeyService` — API key management service
- `DbService` — SQLite database service for messages

## Services

### KeyService

Manages encrypted API keys for different LLM providers.
- Storage: `~/.llm/global/keys/<provider>.key`
- Encryption: AES-256-GCM with machine-derived key

Methods:
- `setKey(provider, apiKey)` — Store an API key
- `getKey(provider)` — Retrieve an API key
- `removeKey(provider)` — Delete an API key
- `hasKey(provider)` — Check if key exists
- `listProviders()` — List providers with stored keys

### DbService

SQLite database for storing LLM usage data.
- Storage: `~/.llm/global/usages/messages.db`
- Stores: BaseAssistantMessage<Api> objects

Methods:
- `saveMessage(message)` — Save a message
- `getMessage(id)` — Get message by ID
- `getMessages(options)` — Query messages with filters
- `deleteMessage(id)` — Delete a message
- `getUsageStats(options)` — Get usage statistics

## Conventions

- Use Hono for routing and middleware
- Export app for testing and composition
- Services are singletons with lazy initialization
- Keep routes in separate files as the app grows

## Dependencies

- Depends on: @ank1015/llm-core, @ank1015/llm-types
- Depended on by: (none yet)
