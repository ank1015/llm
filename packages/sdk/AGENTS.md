# @ank1015/llm-sdk

Unified SDK for LLM interactions with multiple providers. Uses adapter pattern for storage operations (keys, usage, sessions).

## Commands

- `pnpm build` — Compile TypeScript to dist/
- `pnpm dev` — Watch mode compilation
- `pnpm test` — Run all tests
- `pnpm test:unit` — Run unit tests
- `pnpm test:integration` — Run integration tests (requires API keys)
- `pnpm typecheck` — Type-check without emitting

## Structure

```
src/
  index.ts              — Public exports
  adapters/
    index.ts            — Adapter exports
    types.ts            — Adapter interfaces (KeysAdapter, UsageAdapter, SessionsAdapter)
    file-keys.ts        — File-based encrypted keys adapter
    sqlite-usage.ts     — SQLite-based usage tracking adapter
    file-sessions.ts    — JSONL file-based sessions adapter
  llm/
    index.ts            — LLM module exports
    complete.ts         — Complete function with adapter support
    stream.ts           — Stream function with adapter support
  agent/
    index.ts            — Agent module exports
    conversation.ts     — Conversation class (uses core's runAgentLoop)
  session/
    index.ts            — Session module exports
    session-manager.ts  — SessionManager class wrapping SessionsAdapter
```

## Key Exports

### Adapters

Adapters provide pluggable storage for keys, usage tracking, and sessions.

**Interfaces:**

- `KeysAdapter` — Store/retrieve API keys
- `UsageAdapter` — Track LLM usage and costs
- `SessionsAdapter` — Manage conversation sessions

**Built-in Implementations:**

- `FileKeysAdapter` — Encrypted file storage (~/.llm/global/keys/)
- `SqliteUsageAdapter` — SQLite database (~/.llm/global/usages/messages.db)
- `FileSessionsAdapter` — JSONL files (~/.llm/sessions/)

### LLM Functions

- `complete(model, context, options?)` — Complete a chat request
- `stream(model, context, options?)` — Stream a chat request

Options include:

- `providerOptions` — Provider-specific options (apiKey optional)
- `keysAdapter` — Adapter for API key lookup
- `usageAdapter` — Adapter for usage tracking

API key resolution: `providerOptions.apiKey` → `keysAdapter.get()` → error

### Agent

- `Conversation` — Stateful agent class with tool execution
  - Uses core's `runAgentLoop` internally
  - Accepts optional `keysAdapter` and `usageAdapter`

### Session Manager

- `SessionManager` — Wraps a SessionsAdapter for session operations
- `createSessionManager(adapter)` — Create a SessionManager instance

### From Core (re-exported)

- `runAgentLoop` — Stateless agent loop function
- `buildUserMessage`, `buildToolResultMessage` — Message builders
- `getMockMessage` — Mock message generator
- `MODELS`, `getModel`, `getModels`, `calculateCost` — Model utilities

## Usage

### Basic LLM with Adapters

```typescript
import {
  complete,
  getModel,
  createFileKeysAdapter,
  createSqliteUsageAdapter,
} from '@ank1015/llm-sdk';

const keysAdapter = createFileKeysAdapter();
const usageAdapter = createSqliteUsageAdapter();

// Set an API key
await keysAdapter.set('anthropic', 'sk-ant-...');

// Complete with automatic key lookup and usage tracking
const response = await complete(
  getModel('anthropic', 'claude-sonnet-4-20250514')!,
  { messages: [{ role: 'user', id: '1', content: [{ type: 'text', content: 'Hello!' }] }] },
  { keysAdapter, usageAdapter }
);
```

### Direct API Key (no adapter)

```typescript
import { complete, getModel } from '@ank1015/llm-sdk';

const response = await complete(
  getModel('anthropic', 'claude-sonnet-4-20250514')!,
  { messages: [{ role: 'user', id: '1', content: [{ type: 'text', content: 'Hello!' }] }] },
  { providerOptions: { apiKey: 'sk-ant-...' } }
);
```

### Conversation with Adapters

```typescript
import { Conversation, getModel, createFileKeysAdapter } from '@ank1015/llm-sdk';

const keysAdapter = createFileKeysAdapter();
const conversation = new Conversation({ keysAdapter });

conversation.setProvider({ model: getModel('anthropic', 'claude-sonnet-4-20250514')! });
conversation.subscribe((event) => console.log(event.type));

const messages = await conversation.prompt('Hello!');
```

### Session Management

```typescript
import { createSessionManager, createFileSessionsAdapter } from '@ank1015/llm-sdk';

const sessionsAdapter = createFileSessionsAdapter();
const sessionManager = createSessionManager(sessionsAdapter);

// Create a session
const { sessionId, header } = await sessionManager.createSession({
  projectName: 'my-project',
  sessionName: 'My Chat',
});

// Append a message
await sessionManager.appendMessage({
  projectName: 'my-project',
  sessionId,
  parentId: header.id,
  branch: 'main',
  message: { role: 'user', id: 'msg-1', content: [{ type: 'text', content: 'Hello!' }] },
  api: 'anthropic',
  modelId: 'claude-sonnet-4-20250514',
});

// Get the session
const session = await sessionManager.getSession('my-project', sessionId);
```

## Conventions

- Use adapters for storage operations (keys, usage, sessions)
- No server dependency — SDK works standalone with adapters
- API key resolution: explicit apiKey → adapter → error
- Agent events are for UI updates; messages array is the source of truth
- Use `exactOptionalPropertyTypes` — conditionally set optional properties

## Dependencies

- Depends on: @ank1015/llm-types, @ank1015/llm-core, better-sqlite3
- Depended on by: (consumer applications)
