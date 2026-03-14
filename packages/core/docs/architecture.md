# Architecture

`@ank1015/llm-core` is the runtime layer that sits on top of `@ank1015/llm-types`.

## Main pieces

- `src/models/`: provider-specific model catalogs plus `getModel`, `getModels`, `getProviders`, and `calculateCost`
- `src/providers/`: provider implementations and the registry
- `src/llm/`: central `stream()` and `complete()` dispatchers
- `src/agent/`: stateless tool-using agent loop
- `src/utils/`: event stream helpers, validation, JSON parsing, overflow detection, and unicode cleanup

## Registry and self-registration

Providers register themselves at module scope:

1. `src/providers/<name>/index.ts` calls `registerProvider(...)`
2. `src/index.ts` re-exports every provider index file
3. importing the package root triggers those registrations
4. `stream()` looks up the provider by `model.api` and dispatches through the registry

This means the barrel export list in `src/index.ts` is runtime wiring, not just a convenience export.

Tests mirror this pattern in `vitest.setup.ts`, which imports every provider index file directly before any test runs.

## Provider families

The package currently has four implementation families:

### Native SDK streams

- `anthropic`
- `openai`
- `google`

These providers manage their own request and event translation directly because their SDKs and event models are meaningfully different.

### Anthropic-wire streams

- `minimax`
- `claude-code`

These providers speak Anthropic-style message semantics, but differ in auth and transport details. They keep their own stream implementations and reuse Anthropic-flavored message conversion patterns.

### Shared OpenAI chat-completions engine

- `deepseek`
- `kimi`
- `zai`
- `cerebras`
- `openrouter`

These providers all use `providers/utils/chat-stream.ts`, which centralizes chunk handling for OpenAI-compatible chat-completions streams. Provider-specific differences are injected through a small config object and per-provider param builders.

### OpenAI Responses proxy stream

- `codex`

`codex` is close to `openai`, but still keeps its own implementation because it rides a backend proxy with custom auth and stream handling constraints.

## Stream-first design

The runtime is built around streaming:

- every provider exposes a `StreamFunction<TApi>`
- `stream()` is the main dispatch point
- `complete()` just consumes the stream and returns the final message

This keeps the completion path thin and ensures both streaming and non-streaming callers rely on the same event and message-building logic.

## Cross-provider message conversion

Conversation history is not assumed to come from the same provider that will answer next.

When a provider sees an assistant message that originated elsewhere:

- it can use the native provider payload if the original message matches the same provider
- otherwise it falls back to the normalized `content` blocks from `@ank1015/llm-types`

That normalized message layer is what allows tool loops, retries, and provider switching to work without every provider needing bespoke conversion logic for every other provider.

## Why `sideEffects` must stay enabled

Do not mark this package with `sideEffects: false`.

The provider registration model depends on import side effects:

- `src/index.ts` re-exports `providers/<name>/index.ts`
- each provider `index.ts` calls `registerProvider(...)` at module load time

If a bundler assumes those imports are side-effect free and tree-shakes them away, the registry will be empty and `stream()` / `complete()` will fail at runtime for built-in providers.

If this package ever changes to an explicit registration model, that constraint can be revisited. In the current design, it is required.
