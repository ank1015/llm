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
    index.ts            — Adapter exports (interfaces and types only)
    types.ts            — Adapter interfaces (KeysAdapter, UsageAdapter, SessionsAdapter)
    file-keys.ts        — [MOVED to @ank1015/llm-sdk-adapters]
    sqlite-usage.ts     — [MOVED to @ank1015/llm-sdk-adapters]
    file-sessions.ts    — [MOVED to @ank1015/llm-sdk-adapters]
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

**Implementations (in @ank1015/llm-sdk-adapters):**

- `FileKeysAdapter` — Encrypted file storage (~/.llm/global/keys/)
- `SqliteUsageAdapter` — SQLite database (~/.llm/global/usages/messages.db)
- `FileSessionsAdapter` — JSONL files (~/.llm/sessions/)
- `InMemoryKeysAdapter` — In-memory for testing
- `InMemoryUsageAdapter` — In-memory for testing
- `InMemorySessionsAdapter` — In-memory for testing

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
import { complete, getModel } from '@ank1015/llm-sdk';
import { createFileKeysAdapter, createSqliteUsageAdapter } from '@ank1015/llm-sdk-adapters';

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
import { Conversation, getModel } from '@ank1015/llm-sdk';
import { createFileKeysAdapter } from '@ank1015/llm-sdk-adapters';

const keysAdapter = createFileKeysAdapter();
const conversation = new Conversation({ keysAdapter });

conversation.setProvider({ model: getModel('anthropic', 'claude-sonnet-4-20250514')! });
conversation.subscribe((event) => console.log(event.type));

const messages = await conversation.prompt('Hello!');
```

### Session Management

```typescript
import { createSessionManager } from '@ank1015/llm-sdk';
import { createFileSessionsAdapter } from '@ank1015/llm-sdk-adapters';

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

## Testing

```
tests/
  unit/
    adapters/
      file-keys.test.ts       — FileKeysAdapter tests (encryption, CRUD)
      sqlite-usage.test.ts    — SqliteUsageAdapter tests (tracking, stats, filters)
      file-sessions.test.ts   — FileSessionsAdapter tests (JSONL, branches)
    llm/
      complete.test.ts        — Complete function (key resolution, usage tracking)
      stream.test.ts          — Stream function (key resolution, usage tracking)
    conversation/
      state.test.ts           — Conversation state management
      execution.test.ts       — Conversation execution with adapters
    session/
      session-manager.test.ts — SessionManager delegation tests
  integration/
    complete.test.ts          — End-to-end complete tests (requires API keys)
    stream.test.ts            — End-to-end stream tests (requires API keys)
    adapters/
      file-keys.test.ts       — FileKeysAdapter file system tests
      sqlite-usage.test.ts    — SqliteUsageAdapter database tests
      file-sessions.test.ts   — FileSessionsAdapter file system tests
      usage-tracking.test.ts  — End-to-end usage tracking with complete/stream
    session/
      session-manager.test.ts — SessionManager with real adapter
    conversation/
      anthropic.test.ts       — Anthropic provider tests (tools, events)
      openai.test.ts          — OpenAI provider tests
      google.test.ts          — Google provider tests
      deepseek.test.ts        — DeepSeek provider tests
      kimi.test.ts            — Kimi provider tests
      zai.test.ts             — Z.AI provider tests
      budget.test.ts          — Cost/context limit tests
```

Run tests:

- `pnpm test` — All tests
- `pnpm test tests/unit` — Unit tests only
- `pnpm test tests/integration` — Integration tests (requires API keys)

Environment variables for integration tests:

- `ANTHROPIC_API_KEY` — Anthropic API key
- `OPENAI_API_KEY` — OpenAI API key
- `GEMINI_API_KEY` — Google Gemini API key
- `DEEPSEEK_API_KEY` — DeepSeek API key
- `KIMI_API_KEY` — Kimi API key
- `ZAI_API_KEY` — Z.AI API key

## Conventions

- Use adapters for storage operations (keys, usage, sessions)
- No server dependency — SDK works standalone with adapters
- API key resolution: explicit apiKey → adapter → error
- Agent events are for UI updates; messages array is the source of truth
- Use `exactOptionalPropertyTypes` — conditionally set optional properties
- Mock `runAgentLoop` from core in unit tests; use `vi.resetAllMocks()` in beforeEach

## Dependencies

- Depends on: @ank1015/llm-types, @ank1015/llm-core
- Depended on by: @ank1015/llm-sdk-adapters, (consumer applications)
