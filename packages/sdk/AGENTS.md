# @ank1015/llm-sdk

Unified SDK for LLM interactions with multiple providers. This is the main entry point for consuming the LLM SDK.

## Commands

- `pnpm build` — Compile TypeScript to dist/
- `pnpm dev` — Watch mode compilation
- `pnpm typecheck` — Type-check without emitting

## Structure

```
src/
  index.ts          — Re-exports from types and core packages
```

## Key Exports

This package re-exports everything from `@ank1015/llm-types` and `@ank1015/llm-core`:

### From Core
- `complete(model, context, options, id)` — Central completion dispatcher
- `stream(model, context, options, id)` — Central streaming dispatcher
- `MODELS` — All supported model definitions by provider
- `getModel(api, modelId)` — Get a specific model
- `getModels(api)` — Get all models for a provider
- `calculateCost(model, usage)` — Calculate cost from token usage

### From Types
- `Api` — Union of supported providers
- `Model<TApi>` — Generic model definition
- `BaseAssistantMessage<TApi>` — Assistant response type
- `Context` — Conversation context with messages and tools
- `LLMError` — Base error class and subclasses

## Usage

```typescript
import {
  complete,
  stream,
  getModel,
  type BaseAssistantMessage,
} from "@ank1015/llm-sdk";

// Get a model
const model = getModel("anthropic", "claude-sonnet-4-20250514");

// Complete a message
const response = await complete(
  model,
  { messages: [{ role: "user", content: "Hello!" }] },
  { apiKey: "sk-..." },
  "request-id"
);
```

## Conventions

- This package is a facade — no business logic here
- All functionality comes from types and core packages
- Use this package as the primary import for consumers

## Dependencies

- Depends on: @ank1015/llm-types, @ank1015/llm-core
- Depended on by: (consumer applications)
