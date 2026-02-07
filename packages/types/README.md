# @ank1015/llm-types

Type definitions for a provider-agnostic LLM SDK that **preserves native provider types** instead of abstracting them away.

## Philosophy

Most multi-provider LLM libraries define a single common type for options and responses. This loses important provider-specific details — each provider has different capabilities, different parameters, and different response shapes.

This package takes the opposite approach:

- **Provider options are the real SDK types.** `AnthropicProviderOptions` extends Anthropic's `MessageCreateParams`. `OpenAIProviderOptions` extends OpenAI's `ResponseCreateParamsBase`. You get the full set of knobs each provider offers.
- **Native responses are preserved.** `BaseAssistantMessage<'anthropic'>` carries `message: Anthropic.Message`. `BaseAssistantMessage<'openai'>` carries `message: OpenAI.Response`. The original response is always accessible.
- **Normalized fields are added on top.** Every `BaseAssistantMessage` also has a unified `content` array and `usage` object, so you can write provider-agnostic code where it makes sense.

The type system enforces this with generic type parameters (`TApi extends Api`) and type maps (`ApiNativeResponseMap`, `ApiOptionsMap`) that resolve to the correct provider-specific types at compile time.

## Installation

```bash
pnpm add @ank1015/llm-types
```

## Core Types

### Api

```typescript
type Api =
  | 'openai'
  | 'codex'
  | 'google'
  | 'deepseek'
  | 'anthropic'
  | 'claude-code'
  | 'zai'
  | 'kimi';
```

Derived from the `KnownApis` const array. Adding a new string to the array automatically extends the union, and TypeScript exhaustiveness checks will flag every switch/map that needs updating.

### BaseAssistantMessage

The central response type — carries both normalized and native data:

```typescript
interface BaseAssistantMessage<TApi extends Api> {
  role: 'assistant';
  api: TApi;
  model: Model<TApi>;

  // Normalized — same shape for every provider
  content: AssistantResponse; // text blocks, thinking blocks, tool calls
  usage: Usage; // token counts + cost in USD
  stopReason: StopReason; // 'stop' | 'length' | 'toolUse' | 'error' | 'aborted'

  // Native — the provider's original response object
  message: NativeResponseForApi<TApi>;
  // Resolves to:
  //   Anthropic.Message        when TApi = 'anthropic' | 'claude-code'
  //   OpenAI.Response           when TApi = 'openai' | 'codex'
  //   GenerateContentResponse   when TApi = 'google'
  //   ChatCompletion            when TApi = 'deepseek' | 'kimi' | 'zai'
}
```

### Provider Options

Each provider's options type extends the official SDK params, omitting fields managed by the library (model, messages) and adding common fields (apiKey, signal):

```typescript
// Anthropic — extends MessageCreateParamsNonStreaming
type AnthropicProviderOptions = Omit<
  MessageCreateParamsNonStreaming,
  'model' | 'messages' | 'system' | 'max_tokens'
> & { apiKey: string; signal?: AbortSignal; max_tokens?: number };

// OpenAI — extends ResponseCreateParamsBase
type OpenAIProviderOptions = Omit<ResponseCreateParamsBase, 'model' | 'input'> & {
  apiKey: string;
  signal?: AbortSignal;
};

// Google — extends GenerateContentConfig
type GoogleProviderOptions = Omit<GenerateContentConfig, 'abortSignal' | 'systemPrompt'> & {
  apiKey: string;
  signal?: AbortSignal;
};

// DeepSeek, Kimi, Z.AI — extend ChatCompletionCreateParamsBase
type DeepSeekProviderOptions = Omit<ChatCompletionCreateParamsBase, 'model' | 'messages'> & {
  apiKey: string;
  signal?: AbortSignal;
};

// Claude Code — extends Anthropic's MessageCreateParams, uses OAuth + beta headers
type ClaudeCodeProviderOptions = Omit<
  MessageCreateParamsNonStreaming,
  'model' | 'messages' | 'system' | 'max_tokens'
> & { oauthToken: string; betaFlag: string; billingHeader: string; signal?: AbortSignal };

// Codex — extends OpenAI's ResponseCreateParamsBase, uses chatgpt-account-id
type CodexProviderOptions = Omit<ResponseCreateParamsBase, 'model' | 'input'> & {
  apiKey: string;
  'chatgpt-account-id': string;
  instructions?: string;
  signal?: AbortSignal;
};
```

### Type Maps

Compile-time lookups from `Api` to provider-specific types:

```typescript
// Get the native response type for a provider
type NativeResponseForApi<TApi extends Api> = ApiNativeResponseMap[TApi];

// Get the options type for a provider
type OptionsForApi<TApi extends Api> = ApiOptionsMap[TApi];

// Make apiKey optional (for boundaries where it's injected externally)
type WithOptionalKey<T> = Omit<T, 'apiKey'> & { apiKey?: string };
```

### Content

Multimodal content blocks used in messages:

```typescript
type Content = (TextContent | ImageContent | FileContent)[];
```

### Streaming Events

`BaseAssistantEvent<TApi>` is a discriminated union covering the full streaming lifecycle:

- `start` — Stream opened
- `text_start` / `text_delta` / `text_end` — Text content
- `thinking_start` / `thinking_delta` / `thinking_end` — Reasoning content
- `toolcall_start` / `toolcall_delta` / `toolcall_end` — Tool calls
- `done` / `error` — Stream completion

Every event includes the in-progress `BaseAssistantMessage` for accumulated state access.

### Adapter Interfaces

Contracts for SDK storage operations — implementations live in consumer packages:

- `KeysAdapter` — API key storage with multi-credential support (`getCredentials`/`setCredentials` for providers like claude-code that need multiple fields)
- `UsageAdapter` — Usage tracking and statistics (`track`, `getStats`, `getMessages`)
- `SessionsAdapter` — Session CRUD, branching, history, and search
- `UsageFilters`, `UsageStats`, `TokenBreakdown`, `CostBreakdown` — Supporting types

### Error Classes

Typed error hierarchy with `LLMErrorCode` discriminant:

- `LLMError` — Base class with `code` and `message`
- `ApiKeyNotFoundError` — Provider key missing
- `CostLimitError` — Cost budget exceeded
- `ContextLimitError` — Context window exceeded
- `ConversationBusyError` — Concurrent prompt attempted
- `ModelNotConfiguredError` — No provider configured
- `SessionNotFoundError` — Session not found
- `InvalidParentError` — Invalid parent node in session tree
- `PathTraversalError` — Path traversal attack detected

### Agent Types

Types for building tool-using agent loops:

- `AgentTool` — Extends `Tool` with an `execute` function
- `AgentEvent` — Lifecycle events (agent_start, turn_start, message_start, tool_execution_start, etc.)
- `AgentState` / `AgentLoopConfig` — State and configuration

### Session Types

Types for append-only JSONL session storage with tree-structured branching:

- `SessionNode = SessionHeader | MessageNode | CustomNode`
- `Session`, `SessionSummary`, `BranchInfo`
- Service input types for CRUD operations

## Adding a Provider

1. Create `src/providers/<name>.ts` with native response and options types
2. Add to `ApiNativeResponseMap` and `ApiOptionsMap` in `src/providers/index.ts`
3. Add the provider string to `KnownApis` in `src/api.ts`
4. Re-export from `src/index.ts`

TypeScript will flag every location that needs to handle the new provider via exhaustiveness checks on the `Api` union.

## License

MIT
