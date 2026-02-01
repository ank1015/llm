# @ank1015/llm-sdk

Unified SDK for LLM interactions with multiple providers. This is the main entry point for consuming the LLM SDK.

## Commands

- `pnpm build` — Compile TypeScript to dist/
- `pnpm dev` — Watch mode compilation
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
```

## Key Exports

### LLM Functions
- `complete(model, context, options?, id?)` — Complete a chat request
- `stream(model, context, options?, id?)` — Stream a chat request

These functions automatically route:
- **With apiKey**: Calls provider directly via core package
- **Without apiKey**: Calls server endpoints (uses stored keys, tracks usage)

### Configuration
- `setServerUrl(url)` — Set the server URL (default: http://localhost:3001)
- `getServerUrl()` — Get the current server URL

### From Core
- `MODELS` — All supported model definitions
- `getModel(api, modelId)` — Get a specific model
- `getModels(api)` — Get all models for a provider
- `calculateCost(model, usage)` — Calculate cost from token usage
- Provider-specific functions: `completeAnthropic`, `streamAnthropic`, etc.

### From Types
- `Api` — Union of supported providers
- `Model<TApi>` — Generic model definition
- `BaseAssistantMessage<TApi>` — Assistant response type
- `Context` — Conversation context
- `LLMError` — Base error class and subclasses

## Usage

```typescript
import { complete, stream, getModel, setServerUrl } from "@ank1015/llm-sdk";

// Option 1: Direct provider call (with apiKey)
const response = await complete(
  getModel("anthropic", "claude-sonnet-4-20250514"),
  { messages: [{ role: "user", content: [{ type: "text", text: "Hello!" }] }] },
  { apiKey: "sk-..." }
);

// Option 2: Via server (no apiKey, uses stored keys)
setServerUrl("http://localhost:3001");
const response = await complete(
  getModel("anthropic", "claude-sonnet-4-20250514"),
  { messages: [{ role: "user", content: [{ type: "text", text: "Hello!" }] }] }
);
```

## Conventions

- Use this package as the primary import for consumers
- Server URL defaults to http://localhost:3001
- Options are optional; without apiKey, routes to server

## Dependencies

- Depends on: @ank1015/llm-types, @ank1015/llm-core
- Depended on by: (consumer applications)
