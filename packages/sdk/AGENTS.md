# @ank1015/llm-sdk

Unified SDK for LLM interactions with multiple providers. This is the main entry point for consuming the LLM SDK.

## Commands

- `pnpm build` — Compile TypeScript to dist/
- `pnpm dev` — Watch mode compilation
- `pnpm test` — Run all tests
- `pnpm test:unit` — Run unit tests
- `pnpm test:integration` — Run integration tests
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
tests/
  unit/             — Unit tests
  integration/      — Integration tests
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
import { complete, getModel, setServerUrl } from "@ank1015/llm-sdk";

setServerUrl("http://localhost:3001");
const response = await complete(
  getModel("anthropic", "claude-sonnet-4-20250514"),
  { messages: [{ role: "user", content: [{ type: "text", text: "Hello!" }] }] }
);
```

### Agent with Tools

```typescript
import { Conversation, getModel } from "@ank1015/llm-sdk";
import type { AgentTool } from "@ank1015/llm-sdk";

const searchTool: AgentTool = {
  name: "search",
  label: "Web Search",
  description: "Search the web",
  parameters: { type: "object", properties: { query: { type: "string" } } },
  execute: async (toolCallId, params) => ({
    content: [{ type: "text", text: `Results for: ${params.query}` }],
    details: {}
  })
};

const conversation = new Conversation();
conversation.setProvider({ model: getModel("anthropic", "claude-sonnet-4-20250514") });
conversation.setTools([searchTool]);

// Subscribe to events
conversation.subscribe((event) => {
  console.log(event.type, event);
});

// Run a prompt
const messages = await conversation.prompt("Search for TypeScript tutorials");
```

## Conventions

- Use this package as the primary import for consumers
- Server URL defaults to http://localhost:3001
- Options are optional; without apiKey, routes to server
- Agent events are for UI updates; messages array is the source of truth

## Dependencies

- Depends on: @ank1015/llm-types, @ank1015/llm-core
- Depended on by: (consumer applications)
