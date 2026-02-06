# @ank1015/llm-core

Core SDK for multi-provider LLM interactions. Stateless, portable, browser-safe.

## Commands

- `pnpm build` — Compile TypeScript to dist/
- `pnpm dev` — Watch mode compilation
- `pnpm test` — Run all tests (unit + integration)
- `pnpm test tests/unit` — Run unit tests only (no API keys needed)
- `pnpm test tests/integration` — Run integration tests (requires API keys)
- `pnpm typecheck` — Type-check without emitting

## Structure

```
src/
  index.ts                — Public barrel (all exports)
  models.ts               — Model utilities (getModel, getModels, calculateCost)
  models.generated.ts     — Model definitions (auto-generated, do NOT edit)
  llm/
    index.ts              — Re-exports complete() and stream()
    complete.ts           — Central dispatcher → delegates to stream().drain()
    stream.ts             — Central dispatcher → looks up provider in registry
  agent/
    index.ts              — Agent module re-exports
    runner.ts             — Stateless agent loop (runAgentLoop)
    utils.ts              — Message builders (buildUserMessage, buildToolResultMessage)
    mock.ts               — Mock message generator (getMockMessage) via registry
    types.ts              — AgentRunnerConfig, AgentRunnerCallbacks, AgentRunnerResult
  utils/
    index.ts              — Utility re-exports
    event-stream.ts       — EventStream<T,R> and AssistantMessageEventStream<TApi>
    json-parse.ts         — Streaming JSON parser (partial-json)
    overflow.ts           — Context overflow detection (per-provider patterns)
    sanitize-unicode.ts   — Unpaired surrogate removal
    validation.ts         — Tool argument validation (AJV, browser-safe)
    uuid.ts               — UUID v4 generation
    types.ts              — CompleteFunction<TApi> and StreamFunction<TApi>
  providers/
    registry.ts           — Provider registry (Map<string, ProviderRegistration>)
    utils/
      index.ts            — Shared OpenAI-compatible utility exports
      chat-completion-utils.ts  — Client factory, tool converter, stop reason mapper, mock factory
      chat-stream.ts      — Shared streaming engine for OpenAI-compatible providers
    anthropic/            — Anthropic/Claude (native SDK)
      index.ts            — Self-registration + re-exports
      stream.ts           — StreamFunction<'anthropic'>
      utils.ts            — Message builder, param builder, mock factory
    openai/               — OpenAI (native SDK, Responses API)
      index.ts            — Self-registration + re-exports
      stream.ts           — StreamFunction<'openai'>
      utils.ts            — Message builder, param builder, mock factory
    google/               — Google/Gemini (native SDK)
      index.ts            — Self-registration + re-exports + GoogleThinkingLevel
      stream.ts           — StreamFunction<'google'>
      utils.ts            — Message builder, param builder, mock factory
    deepseek/             — DeepSeek (OpenAI-compatible)
      index.ts            — Self-registration + re-exports
      stream.ts           — Uses shared chat-stream engine
      utils.ts            — Message builder, param builder, mock factory
    kimi/                 — Kimi/Moonshot (OpenAI-compatible)
      index.ts            — Self-registration + re-exports
      stream.ts           — Uses shared chat-stream engine
      utils.ts            — Message builder, param builder, mock factory
    zai/                  — Z.AI (OpenAI-compatible)
      index.ts            — Self-registration + re-exports
      stream.ts           — Uses shared chat-stream engine
      utils.ts            — Message builder, param builder, mock factory
tests/
  unit/                   — No API calls, fast, mocked
    agent/                — runner, utils, mock tests
    llm/                  — Central dispatcher tests (complete, stream)
    providers/            — Per-provider utils tests (*-utils.test.ts)
    utils/                — Utility function tests
    models.test.ts        — Model utilities tests
  integration/            — Require API keys, call real services
    agent/                — Agent runner integration test
    anthropic/            — stream.test.ts, complete.test.ts
    openai/               — stream.test.ts, complete.test.ts
    google/               — stream.test.ts, complete.test.ts
    deepseek/             — stream.test.ts, complete.test.ts
    kimi/                 — stream.test.ts, complete.test.ts
    zai/                  — stream.test.ts, complete.test.ts
```

## Key Concepts

### Self-Registering Provider Pattern

Providers register themselves when their `index.ts` is imported:

```
providers/<name>/index.ts calls registerProvider()
     ↑ imported by
src/index.ts via `export * from './providers/<name>/index.js'`
```

The `export *` triggers the side-effect import, which calls `registerProvider()`. At runtime, `stream()` dispatches to the correct provider via the registry.

**For tests:** `vitest.setup.ts` imports all provider `index.ts` files directly to ensure registration happens before any test runs.

### Two Provider Categories

1. **Native SDK providers** (Anthropic, OpenAI, Google) — Use provider-specific SDKs, implement streaming from scratch
2. **OpenAI-compatible providers** (DeepSeek, Kimi, Z.AI) — Use `openai` SDK with custom baseURL, share `createChatCompletionStream()` engine from `providers/utils/chat-stream.ts`

### Streaming-First Architecture

- Every provider implements only a `StreamFunction<TApi>`
- `complete()` delegates to `stream().drain()` — no separate complete implementations
- Streaming uses `AssistantMessageEventStream<TApi>` which extends `EventStream<T, R>`

### Cross-Provider Message Building

Each provider's `build<Provider>Messages()` converts unified `Context` messages to provider-native format. When a message originated from a different provider, the normalized `content` field is used for conversion (e.g., Anthropic messages replayed through OpenAI).

## Key Exports

**Use these (central dispatchers):**

- `stream(model, context, options, id)` — Streaming via registry dispatch
- `complete(model, context, options, id)` — Non-streaming (delegates to stream().drain())

**Agent:**

- `runAgentLoop(config, messages, emit, signal, callbacks)` — Stateless agent loop
- `buildUserMessage(input, attachments?)` — Build UserMessage
- `buildToolResultMessage(toolCall, result, isError, errorDetails?)` — Build ToolResultMessage
- `getMockMessage(model, messageId?)` — Mock BaseAssistantMessage for initial events

**Models:**

- `MODELS` — All model definitions by provider
- `getModel(api, modelId)` / `getModels(api)` / `calculateCost(model, usage)`

**Registry:**

- `registerProvider(api, registration)` — Register custom providers

**Per-provider (prefer central dispatchers):**

- `stream<Provider>` / `getMock<Provider>Message` for each provider

## Conventions

- Each provider directory has exactly 3 files: `index.ts`, `stream.ts`, `utils.ts`
- No `complete.ts` in provider directories — complete delegates to stream
- Provider `index.ts` must call `registerProvider()` at module level
- Use TypeBox for tool parameter schemas
- Export all public API from `src/index.ts`
- Tests in `tests/` directory, mirroring `src/` structure

## Adding a New Provider

See [ADDING_PROVIDER.md](./ADDING_PROVIDER.md) for the full 10-file checklist.

**Quick summary:** Create types in `packages/types/`, create `index.ts` + `stream.ts` + `utils.ts` in `providers/<name>/`, add barrel export in `src/index.ts`, add to `vitest.setup.ts`, add models to `models.generated.ts`.

**Files that never need touching:** `registry.ts`, `complete.ts` (central), `stream.ts` (central), `mock.ts`

## Boundaries

**Never:**

- Edit `models.generated.ts` manually (auto-generated)
- Edit `registry.ts` when adding providers (providers self-register)
- Create `complete.ts` in provider directories
- Use `any` without `eslint-disable` comment and justification

**Ask first:**

- Modifying the shared chat-stream engine (affects DeepSeek, Kimi, Z.AI)
- Changing the `BaseAssistantMessage` or `BaseAssistantEvent` type shapes (in types package)
- Adding new dependencies

**Freely:**

- Add new providers following the checklist
- Add unit tests
- Fix type errors

## Dependencies

- Depends on: `@ank1015/llm-types`
- Depended on by: `@ank1015/llm-sdk`
