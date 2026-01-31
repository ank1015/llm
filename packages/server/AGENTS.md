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
  routes/
    index.ts            — Route exports
    messages.ts         — /messages/complete and /messages/stream endpoints
    keys.ts             — /keys API key management endpoints
tests/
  unit/
    services/           — Service unit tests
```

## Endpoints

### GET /health
Health check endpoint.

### POST /messages/complete
Non-streaming completion. Returns `BaseAssistantMessage`.

Request body: `MessageRequest`
- `api` — Provider (anthropic, openai, google, etc.)
- `modelId` — Model identifier
- `messages` — Conversation messages
- `systemPrompt?` — System instructions
- `tools?` — Available tools
- `providerOptions?` — Provider-specific options

### POST /messages/stream
Streaming completion using SSE. Returns events followed by final message.

Events:
- `start`, `text_start`, `text_delta`, `text_end`
- `thinking_start`, `thinking_delta`, `thinking_end`
- `toolcall_start`, `toolcall_delta`, `toolcall_end`
- `done`, `error`
- `message` — Final BaseAssistantMessage

### GET /keys
List all providers with stored API keys.

### GET /keys/:api
Check if an API key exists for a provider (does not return the key).

### POST /keys/:api
Add an API key for a provider.
Request body: `{ "apiKey": "sk-..." }`

### PUT /keys/:api
Update an API key for a provider (alias for POST).
Request body: `{ "apiKey": "sk-..." }`

### DELETE /keys/:api
Remove an API key for a provider.

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

## Error Handling

All endpoints return structured errors:
```json
{
  "error": true,
  "code": "API_KEY_NOT_FOUND",
  "message": "API key not found for provider: anthropic",
  "details": { "provider": "anthropic" }
}
```

Error codes:
- `API_KEY_NOT_FOUND` (401) — No API key for provider
- `MODEL_NOT_FOUND` (404) — Model not found
- `INVALID_REQUEST` (400) — Bad request body
- `PROVIDER_ERROR` (502) — Error from LLM provider
- `CONTEXT_OVERFLOW` (413) — Input exceeds context window
- `RATE_LIMIT` (429) — Rate limit exceeded

## Conventions

- Use Hono for routing and middleware
- Export app for testing and composition
- Services are singletons with lazy initialization
- Routes in `routes/` directory
- All responses saved to DbService

## Dependencies

- Depends on: @ank1015/llm-core, @ank1015/llm-types
- Depended on by: @ank1015/llm-usage-dashboard
