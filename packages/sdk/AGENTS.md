# @ank1015/llm-sdk

Unified SDK for LLM interactions with multiple providers. This is the main entry point for consuming the LLM SDK.

## Commands

- `pnpm build` — Compile TypeScript to dist/
- `pnpm dev` — Watch mode compilation
- `pnpm test` — Run all tests
- `pnpm test:unit` — Run unit tests
- `pnpm test:integration` — Run integration tests (requires API keys and server)
- `pnpm typecheck` — Type-check without emitting

## Structure

```
src/
  index.ts          — Public exports
  config.ts         — Server URL configuration
  llm/
    index.ts        — LLM module exports
    complete.ts     — Complete function (routes to core or server)
    stream.ts       — Stream function (routes to core or server)
    llm-client.ts   — LLMClient interface and DefaultLLMClient
  agent/
    index.ts        — Agent module exports
    conversation.ts — Conversation class (state management, event emitting)
    runner.ts       — AgentRunner interface and DefaultAgentRunner (execution logic)
    utils.ts        — Utility functions (buildUserMessage, buildToolResultMessage)
  session/
    index.ts        — Session module exports
    session-client.ts — SessionClient interface and DefaultSessionClient
tests/
  unit/
    llm/            — LLM function unit tests
      complete.test.ts
      stream.test.ts
    conversation/   — Conversation unit tests
      state.test.ts      — State management tests
      runner.test.ts     — AgentRunner tests
      execution.test.ts  — Tool execution tests
  integration/
    complete.test.ts     — LLM complete integration tests
    stream.test.ts       — LLM stream integration tests
    conversation/        — Conversation integration tests (per provider)
      anthropic.test.ts
      openai.test.ts
      google.test.ts
      deepseek.test.ts
      kimi.test.ts
      zai.test.ts
      budget.test.ts     — Cost/context limit tests
```

## Key Exports

### LLM Functions

- `complete(model, context, options?, id?)` — Complete a chat request
- `stream(model, context, options?, id?)` — Stream a chat request

These functions automatically route:

- **With apiKey**: Calls provider directly via core package
- **Without apiKey**: Calls server endpoints (uses stored keys, tracks usage)

### Agent

- `Conversation` — Main agent class for managing conversations with tool execution
- `DefaultAgentRunner` — Default implementation of the agent execution loop
- `DefaultLLMClient` — Default LLM client implementation
- `buildUserMessage(input, attachments?)` — Build a user message
- `buildToolResultMessage(toolCall, result, isError, errorDetails?)` — Build a tool result message

### Configuration

- `setServerUrl(url)` — Set the server URL (default: http://localhost:3001)
- `getServerUrl()` — Get the current server URL

### Session Client

- `sessionClient` — Default session client instance
- `DefaultSessionClient` — Default implementation of SessionClient
- `SessionClient` (interface) — Interface for dependency injection/testing

Methods: `listProjects()`, `listSessions()`, `searchSessions()`, `createSession()`, `getSession()`, `deleteSession()`, `updateSessionName()`, `appendMessage()`, `appendCustom()`, `getBranches()`, `getBranchHistory()`, `getNode()`, `getLatestNode()`, `getMessages()`

### From Core

- `MODELS` — All supported model definitions
- `getModel(api, modelId)` — Get a specific model
- `getModels(api)` — Get all models for a provider
- `calculateCost(model, usage)` — Calculate cost from token usage

### Agent Types (from @ank1015/llm-types)

- `AgentTool` — Tool definition with execute function
- `AgentState` — Agent state (messages, tools, provider, usage)
- `AgentLoopConfig` — Configuration for agent loop execution
- `AgentEvent` — Events emitted during agent execution
- `Attachment` — File/image attachment for user messages

## Usage

### Basic LLM Usage

```typescript
import { complete, getModel, setServerUrl } from '@ank1015/llm-sdk';

setServerUrl('http://localhost:3001');
const response = await complete(getModel('anthropic', 'claude-sonnet-4-20250514'), {
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello!' }] }],
});
```

### Agent with Tools

```typescript
import { Conversation, getModel } from '@ank1015/llm-sdk';
import type { AgentTool } from '@ank1015/llm-sdk';

const searchTool: AgentTool = {
  name: 'search',
  label: 'Web Search',
  description: 'Search the web',
  parameters: { type: 'object', properties: { query: { type: 'string' } } },
  execute: async (toolCallId, params) => ({
    content: [{ type: 'text', text: `Results for: ${params.query}` }],
    details: {},
  }),
};

const conversation = new Conversation();
conversation.setProvider({ model: getModel('anthropic', 'claude-sonnet-4-20250514')! });
conversation.setTools([searchTool]);

// Subscribe to events
conversation.subscribe((event) => {
  console.log(event.type, event);
});

// Run a prompt
const messages = await conversation.prompt('Search for TypeScript tutorials');
```

### Session Management

```typescript
import { sessionClient, setServerUrl } from '@ank1015/llm-sdk';

setServerUrl('http://localhost:3001');

// Create a session
const { sessionId, header } = await sessionClient.createSession('my-project', '', 'My Chat');

// Append a message
await sessionClient.appendMessage(
  'my-project',
  sessionId,
  header.id, // parentId
  'main', // branch
  { role: 'user', id: 'msg-1', content: [{ type: 'text', text: 'Hello!' }] },
  'anthropic',
  'claude-sonnet-4-20250514'
);

// Get the session
const session = await sessionClient.getSession('my-project', sessionId);

// List all sessions
const { sessions } = await sessionClient.listSessions('my-project');
```

## Testing

### Unit Tests

Unit tests use mocks and don't require API keys or server:

```bash
pnpm test:unit
```

### Integration Tests

Integration tests require:

1. Server running on localhost:3001 with API keys configured
2. Or environment variables set (ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.)

```bash
# Start server first
pnpm dev:server

# Run integration tests
pnpm test:integration
```

## Conventions

- Use this package as the primary import for consumers
- Server URL defaults to http://localhost:3001
- Options are optional; without apiKey, routes to server
- Agent events are for UI updates; messages array is the source of truth
- Use `exactOptionalPropertyTypes` — conditionally set optional properties, don't assign undefined

## Dependencies

- Depends on: @ank1015/llm-types, @ank1015/llm-core
- Depended on by: (consumer applications)
