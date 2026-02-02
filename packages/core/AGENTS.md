# @ank1015/llm-core

Core SDK for LLM interactions with multiple providers.

## Commands

- `pnpm build` — Compile TypeScript to dist/
- `pnpm dev` — Watch mode compilation
- `pnpm test` — Run all tests
- `pnpm test tests/unit` — Run unit tests only
- `pnpm test tests/integration` — Run integration tests (requires API keys)
- `pnpm typecheck` — Type-check without emitting

## Structure

```
src/
  index.ts              — Public exports
  models.ts             — Model utilities (getModel, getModels, calculateCost)
  models.generated.ts   — Model definitions (auto-generated, do not edit manually)
  llm/
    index.ts            — LLM module exports
    complete.ts         — Central complete() dispatcher
    stream.ts           — Central stream() dispatcher
  agent/
    index.ts            — Agent module exports
    runner.ts           — Stateless agent loop (runAgentLoop)
    utils.ts            — Message builders (buildUserMessage, buildToolResultMessage)
    mock.ts             — Mock message generator (getMockMessage)
    types.ts            — Agent runner types
  utils/
    index.ts            — Utility exports
    event-stream.ts     — EventStream and AssistantMessageEventStream classes
    json-parse.ts       — Streaming JSON parser
    overflow.ts         — Context overflow detection
    sanitize-unicode.ts — Unicode surrogate sanitization
    validation.ts       — Tool argument validation (AJV)
    types.ts            — CompleteFunction and StreamFunction type definitions
  providers/
    anthropic/          — Anthropic/Claude provider
      index.ts          — Provider exports
      complete.ts       — Non-streaming completion
      stream.ts         — Streaming completion
      utils.ts          — Provider-specific utilities
    openai/             — OpenAI provider
      index.ts          — Provider exports
      complete.ts       — Non-streaming completion
      stream.ts         — Streaming completion
      utils.ts          — Provider-specific utilities
    google/             — Google/Gemini provider
      index.ts          — Provider exports
      complete.ts       — Non-streaming completion
      stream.ts         — Streaming completion
      utils.ts          — Provider-specific utilities
    deepseek/           — DeepSeek provider
      index.ts          — Provider exports
      complete.ts       — Non-streaming completion
      stream.ts         — Streaming completion
      utils.ts          — Provider-specific utilities
    kimi/               — Kimi/Moonshot provider
      index.ts          — Provider exports
      complete.ts       — Non-streaming completion
      stream.ts         — Streaming completion
      utils.ts          — Provider-specific utilities
    zai/                — Z.AI provider
      index.ts          — Provider exports
      complete.ts       — Non-streaming completion
      stream.ts         — Streaming completion
      utils.ts          — Provider-specific utilities
tests/
  unit/                 — Unit tests (no API calls)
    llm/                — Central dispatcher tests
    providers/          — Provider utility tests
    utils/              — Utility function tests
  integration/          — Integration tests (require API keys)
    anthropic/          — Anthropic API tests
    openai/             — OpenAI API tests
    google/             — Google/Gemini API tests
    deepseek/           — DeepSeek API tests
    kimi/               — Kimi API tests
    zai/                — Z.AI API tests
```

## Key Exports

- `complete(model, context, options, id)` — Central completion dispatcher (use this!)
- `stream(model, context, options, id)` — Central streaming dispatcher (use this!)
- `runAgentLoop(config, messages, emit, signal, callbacks)` — Stateless agent loop
- `buildUserMessage(input, attachments?)` — Build a UserMessage from text input
- `buildToolResultMessage(toolCall, result, isError, errorDetails?)` — Build a ToolResultMessage
- `getMockMessage(model)` — Create a mock BaseAssistantMessage for initial events
- `MODELS` — All supported model definitions by provider
- `getModel(api, modelId)` — Get a specific model
- `getModels(api)` — Get all models for a provider
- `calculateCost(model, usage)` — Calculate cost from token usage
- `completeAnthropic` / `streamAnthropic` — Anthropic provider functions
- `completeOpenAI` / `streamOpenAI` — OpenAI provider functions
- `completeGoogle` / `streamGoogle` — Google/Gemini provider functions
- `completeDeepSeek` / `streamDeepSeek` — DeepSeek provider functions
- `completeKimi` / `streamKimi` — Kimi/Moonshot provider functions
- `completeZai` / `streamZai` — Z.AI provider functions
- `EventStream` / `AssistantMessageEventStream` — Streaming utilities

## Conventions

- Export all public functions from `src/index.ts`
- Colocate tests as `*.test.ts` files
- Use TypeBox for tool parameter schemas
- Provider implementations go in `providers/<provider-name>/`
- Each provider exports `complete<Provider>` and `stream<Provider>` functions

## Adding a New Provider

1. Create `providers/<provider>/` directory
2. Implement `complete.ts` with `CompleteFunction<"provider">` signature
3. Implement `stream.ts` with `StreamFunction<"provider">` signature
4. Create `utils.ts` for provider-specific helpers
5. Export from `providers/<provider>/index.ts`
6. Add exports to `src/index.ts`

## Dependencies

- Depends on: @ank1015/llm-types
- Depended on by: @ank1015/llm-sdk, @ank1015/llm-server
