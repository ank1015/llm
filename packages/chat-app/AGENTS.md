# @ank1015/llm-chat-app

Next.js chat application package.

## Commands

- `pnpm dev` - Run development server
- `pnpm build` - Build for production
- `pnpm start` - Start production server
- `pnpm lint` - Run ESLint
- `pnpm typecheck` - Type-check without emitting

## Structure

```
src/
  app/
    layout.tsx
    page.tsx
    globals.css
    api/
      keys/
        route.ts              — GET: list providers with key status
        [provider]/route.ts   — PUT: set key, DELETE: delete key
      models/route.ts         — GET: list models with filters
      providers/route.ts      — GET: list providers with capabilities
      sessions/
        route.ts              — GET: list sessions, POST: create session
        [sessionId]/
          route.ts            — GET: get session, PATCH: rename, DELETE: delete
          messages/route.ts   — GET: get messages, POST: run conversation turn
          stream/route.ts     — POST: stream conversation turn (SSE)
  lib/
    api/
      keys.ts                 — Keys adapter factory and helpers
      sessions.ts             — Sessions adapter factory and helpers
      conversation.ts         — Conversation turn logic (shared by messages/stream)
      response.ts             — API response utilities
    client-api/
      index.ts                — Client API exports
      http.ts                 — HTTP utilities (apiRequestJson, buildQueryString)
      catalog.ts              — getProvidersCatalog, getModelsCatalog
      sessions.ts             — listSessions
      conversation.ts         — getSessionMessages, promptConversation, streamConversation
    contracts/
      index.ts                — Contract exports
      api.ts                  — Shared API types (SessionRef, request/response types)
  stores/
    index.ts                  — Store exports (imports coordination.ts)
    coordination.ts           — Cross-store sync (activeSession, model selection)
    chat-store.ts             — Chat state per session (messages, streaming, pending prompts)
    chat-settings-store.ts    — Chat settings per session (api, model, system prompt) [persisted]
    composer-store.ts         — Composer state per session (draft, attachments) [persisted]
    providers-store.ts        — Providers/models catalog and selection
    sessions-store.ts         — Sessions list state (pagination, search, optimistic updates)
    ui-store.ts               — UI state (sidebar, settings, dialogs)
tests/
  integration/
    api-routes.test.mjs       — Integration tests for API routes
```

## API Endpoints

### Keys API

- `GET /api/keys` — List all providers and whether they have a key stored
- `PUT /api/keys/[provider]` — Set API key (body: `{ "key": "..." }`)
- `DELETE /api/keys/[provider]` — Delete API key

### Models API

- `GET /api/models` — List all models with optional filters
  - `?api=<provider>` — Filter by provider
  - `?reasoning=true|false` — Filter by reasoning capability
  - `?input=text|image|file` — Filter by input type
  - `?tool=<tool>` — Filter by tool support

### Providers API

- `GET /api/providers` — List all providers with capabilities (hasKey, modelCount, supportsReasoning, supportsTools, supportedInputs)

### Sessions API

- `GET /api/sessions` — List sessions
  - `?projectName=<name>` — Filter by project (default: "default")
  - `?path=<path>` — Filter by path
  - `?query=<search>` — Search sessions by name
  - `?limit=<n>&offset=<n>` — Pagination
- `POST /api/sessions` — Create session (body: `{ projectName?, path?, sessionName? }`)
- `GET /api/sessions/[sessionId]` — Get session with branches and latest node
  - `?projectName=<name>&path=<path>` — Session scope
  - `?branch=<name>` — Filter latest node by branch
- `PATCH /api/sessions/[sessionId]` — Rename session (body: `{ projectName?, path?, sessionName }`)
- `DELETE /api/sessions/[sessionId]` — Delete session

### Messages API

- `GET /api/sessions/[sessionId]/messages` — Get messages from session
  - `?projectName=<name>&path=<path>` — Session scope
  - `?branch=<name>` — Filter by branch
  - `?limit=<n>&offset=<n>` — Pagination
- `POST /api/sessions/[sessionId]/messages` — Run conversation turn (non-streaming)
  - Body: `{ projectName?, path?, branch?, parentId?, prompt, api, modelId, providerOptions?, systemPrompt?, attachments? }`
  - Returns: `{ messages, nodes, branch }`

### Stream API

- `POST /api/sessions/[sessionId]/stream` — Run conversation turn (SSE streaming)
  - Body: Same as POST messages
  - Events: `ready`, `agent_event`, `done`, `error`

## Dependencies

- Depends on: @ank1015/llm-sdk (for adapters), zustand (state management)

## Conventions

- Use App Router (Next.js 14+)
- Use strict TypeScript
- Server Components by default
- Scaffold new API routes first, then fill business logic incrementally
