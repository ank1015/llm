# @ank1015/llm-types

Shared contracts for a multi-provider LLM SDK that **preserve native provider types** instead of flattening everything into a lowest-common-denominator abstraction.

This package is mostly compile-time types, with a very small shared runtime surface:

- `KnownApis`
- `isValidApi()`
- `LLMError` and its subclasses

## Why This Package Exists

The monorepo has packages that need the shared contracts without needing the full runtime implementation. For example:

- `@ank1015/llm-core` implements provider calls and streaming
- `@ank1015/llm-sdk` composes higher-level workflows on top
- `@ank1015/llm-sdk-adapters` implements storage adapters and mostly needs interfaces, messages, sessions, and errors

Keeping the contracts separate lets those packages share the same shapes without forcing all of them to depend on the provider runtime stack.

## Philosophy

Most multi-provider LLM libraries normalize both inputs and outputs so aggressively that provider-specific capabilities disappear.

This package takes a different approach:

- **Provider options stay provider-native.** `OpenAIProviderOptions` stays close to the OpenAI Responses API. `AnthropicProviderOptions` stays close to Anthropic Messages. `GoogleProviderOptions` stays close to `@google/genai`.
- **Native responses are preserved.** `BaseAssistantMessage<TApi>` always keeps the original provider response object in `message`.
- **Normalized fields are added on top.** You still get provider-agnostic `content`, `usage`, `stopReason`, and streaming event shapes for UI and orchestration logic.

## Installation

```bash
pnpm add @ank1015/llm-types
```

## Supported Providers

```typescript
type Api =
  | 'openai'
  | 'codex'
  | 'google'
  | 'deepseek'
  | 'anthropic'
  | 'claude-code'
  | 'zai'
  | 'kimi'
  | 'minimax'
  | 'cerebras'
  | 'openrouter';
```

The union is derived from `KnownApis`, so adding a provider in `src/api.ts` automatically updates the type and triggers exhaustiveness errors across consumers.

## Core Types

### `BaseAssistantMessage<TApi>`

The central response contract preserves both normalized and native data:

```typescript
interface BaseAssistantMessage<TApi extends Api> {
  role: 'assistant';
  api: TApi;
  id: string;
  model: Model<TApi>;

  // Normalized fields
  content: AssistantResponse;
  usage: Usage;
  stopReason: StopReason;
  timestamp: number;
  duration: number;
  errorMessage?: string;

  // Provider-native response
  message: NativeResponseForApi<TApi>;
}
```

`NativeResponseForApi<TApi>` resolves to the real SDK response type:

- `anthropic`, `claude-code`, `minimax` -> `Anthropic.Message`
- `openai`, `codex` -> `OpenAI.Response`
- `google` -> `GenerateContentResponse`
- `deepseek`, `kimi`, `zai`, `cerebras`, `openrouter` -> `ChatCompletion`

### `BaseAssistantEvent<TApi>`

Typed streaming events cover the full assistant lifecycle:

- `start`
- `text_start` / `text_delta` / `text_end`
- `thinking_start` / `thinking_delta` / `thinking_end`
- `image_start` / `image_frame` / `image_end`
- `toolcall_start` / `toolcall_delta` / `toolcall_end`
- `done`
- `error`

Every event includes the in-progress `BaseAssistantMessage<TApi>`.

### `Content`

Unified multimodal content blocks:

```typescript
type Content = (TextContent | ImageContent | FileContent)[];
```

`ImageContent` also supports normalized generated-image metadata such as:

- generation stage (`partial`, `thought`, `final`)
- provider
- provider item id
- revised prompt
- output size / quality / format / background

### `Model<TApi>` and `Provider<TApi>`

`Model<TApi>` is the shared model metadata contract:

- `api`, `id`, `name`, `baseUrl`
- `reasoning`
- supported inputs
- token pricing
- `contextWindow`, `maxTokens`
- `headers`
- supported tool capabilities

`Provider<TApi>` pairs a model with its provider-specific options.

### `Tool` and `Context`

Tools use TypeBox schemas directly:

```typescript
interface Tool<TParameters extends TSchema = TSchema> {
  name: string;
  description: string;
  parameters: TParameters;
}

interface Context {
  messages: Message[];
  systemPrompt?: string;
  tools?: Tool[];
}
```

## Provider Option Families

The current provider options fall into a few families:

- **Anthropic Messages-compatible**
  - `AnthropicProviderOptions`
  - `ClaudeCodeProviderOptions`
  - `MiniMaxProviderOptions`
- **OpenAI Responses-compatible**
  - `OpenAIProviderOptions`
  - `CodexProviderOptions`
- **Google GenAI-compatible**
  - `GoogleProviderOptions`
- **OpenAI Chat Completions-compatible**
  - `DeepSeekProviderOptions`
  - `KimiProviderOptions`
  - `ZaiProviderOptions`
  - `CerebrasProviderOptions`
  - `OpenRouterProviderOptions`

The package preserves provider-specific extensions where needed, for example:

- `CodexProviderOptions` requires `chatgpt-account-id`
- `ClaudeCodeProviderOptions` uses `oauthToken`, `betaFlag`, and `billingHeader`
- `KimiProviderOptions` and `ZaiProviderOptions` expose thinking config
- `CerebrasProviderOptions` exposes reasoning format / effort controls

## Type Maps

Compile-time lookups connect `Api` to the right native response and options type:

```typescript
type NativeResponseForApi<TApi extends Api> = ApiNativeResponseMap[TApi];
type OptionsForApi<TApi extends Api> = ApiOptionsMap[TApi];
type WithOptionalKey<T> = Omit<T, 'apiKey'> & { apiKey?: string };
```

## Agent Contracts

This package also defines the shared contracts for tool-using agents:

- `AgentTool`
- `AgentToolResult<T>`
- `AgentState`
- `AgentLoopConfig`
- `AgentEvent`
- `Attachment`
- `QueuedMessage<T>`
- `ToolExecutionContext`

These are shared here because they are part of the monorepo-wide contract surface, even though the runtime agent loop lives in `@ank1015/llm-core`.

## Storage Contracts

Shared adapter and session types also live here:

- `KeysAdapter`
- `UsageAdapter`
- `SessionsAdapter`
- `SessionNode`, `Session`, `SessionSummary`, `BranchInfo`
- `CreateSessionInput`, `AppendMessageInput`, `AppendCustomInput`, `UpdateSessionNameInput`

These contracts are consumed directly by packages like `@ank1015/llm-sdk-adapters`.

## Error Classes

Minimal shared runtime errors are exported so every package can throw and catch the same error types:

- `LLMError`
- `ApiKeyNotFoundError`
- `CostLimitError`
- `ContextLimitError`
- `ConversationBusyError`
- `ModelNotConfiguredError`
- `SessionNotFoundError`
- `InvalidParentError`
- `PathTraversalError`

## Adding a Provider

1. Create `src/providers/<name>.ts` with native response and provider options types
2. Add the provider string to `KnownApis` in `src/api.ts`
3. Add it to `ApiNativeResponseMap` and `ApiOptionsMap` in `src/providers/index.ts`
4. Re-export it from `src/providers/index.ts`
5. Re-export it from `src/index.ts`

TypeScript will surface exhaustiveness errors anywhere the new provider is not handled.

## What Does and Doesn't Belong Here

Belongs here:

- Shared public contracts
- Provider-native response and option types
- Agent/storage/session interfaces
- Small shared runtime primitives used across packages

Does not belong here:

- API clients
- Provider request execution
- Streaming implementations
- Model catalogs
- Registry/dispatch logic

Those live in `@ank1015/llm-core`.

## License

MIT
