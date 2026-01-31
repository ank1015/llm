# @ank1015/llm-core

Core SDK for LLM interactions with multiple providers.

## Commands

- `pnpm build` — Compile TypeScript to dist/
- `pnpm dev` — Watch mode compilation
- `pnpm test` — Run tests with Vitest
- `pnpm typecheck` — Type-check without emitting

## Structure

```
src/
  index.ts              — Public exports
  models.ts             — Model utilities (getModel, getModels, calculateCost)
  models.generated.ts   — Model definitions (auto-generated, do not edit manually)
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
```

## Key Exports

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
- Depended on by: (none yet)
