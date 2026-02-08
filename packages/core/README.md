# @ank1015/llm-core

A provider-agnostic LLM SDK that gives you a single interface to multiple providers **without abstracting away their native options or responses**.

## Why This Library?

Existing multi-provider libraries (Vercel AI SDK, LiteLLM, etc.) abstract both the input and output of different providers into a common type. This approach has a fundamental problem: LLM providers are not interchangeable. They offer very different options, capabilities, and response shapes. Forcing them into a lowest-common-denominator interface loses important provider-specific details and creates confusion about what's actually happening under the hood.

**This library takes a different approach:**

- **Provider options are preserved.** When you call Anthropic, you pass `AnthropicProviderOptions`. When you call OpenAI, you pass `OpenAIProviderOptions`. You get the full set of knobs each provider offers — no guessing which fields map to what.
- **Native responses are preserved.** Every `BaseAssistantMessage<TApi>` carries a `message` field containing the provider's original, unmodified response object. You always have access to the raw data.
- **Normalized fields are added, not substituted.** On top of the native response, the library adds a unified `content` array (text, thinking, tool calls) and a `usage` object with cost breakdown. These let you write provider-agnostic logic where it makes sense — without losing anything.

The result: you can switch providers with a single model change, write generic UI code against the normalized fields, and still reach into the native response when you need provider-specific data.

## Installation

```bash
pnpm add @ank1015/llm-core
```

## Quick Start

### Streaming

```typescript
import { stream, getModel } from '@ank1015/llm-core';

const model = getModel('anthropic', 'claude-sonnet-4-20250514');

const eventStream = stream(
  model,
  {
    messages: [{ role: 'user', id: '1', content: [{ type: 'text', content: 'Hello!' }] }],
  },
  { apiKey: process.env.ANTHROPIC_API_KEY },
  'request-1'
);

for await (const event of eventStream) {
  if (event.type === 'text_delta') {
    process.stdout.write(event.delta);
  }
}

const message = await eventStream.result();
console.log(message.usage.cost.total); // cost in USD
```

### Non-Streaming

```typescript
import { complete, getModel } from '@ank1015/llm-core';

const model = getModel('openai', 'gpt-4.1');

const message = await complete(
  model,
  {
    messages: [{ role: 'user', id: '1', content: [{ type: 'text', content: 'Hello!' }] }],
  },
  { apiKey: process.env.OPENAI_API_KEY },
  'request-1'
);

// Normalized content — works the same for any provider
for (const block of message.content) {
  if (block.type === 'response') console.log(block.content);
  if (block.type === 'thinking') console.log(block.thinkingText);
  if (block.type === 'toolCall') console.log(block.name, block.arguments);
}

// Native response — full provider-specific data
console.log(message.message); // OpenAI Response object
```

### Switching Providers

```typescript
// Same code, different provider — just change the model and options
const anthropicModel = getModel('anthropic', 'claude-sonnet-4-20250514');
const openaiModel = getModel('openai', 'gpt-4.1');
const googleModel = getModel('google', 'gemini-2.5-pro');

// The context and result shape are identical
const result = await complete(anthropicModel, context, { apiKey: ANTHROPIC_KEY }, id);
const result = await complete(openaiModel, context, { apiKey: OPENAI_KEY }, id);
const result = await complete(googleModel, context, { apiKey: GOOGLE_KEY }, id);

// All three return BaseAssistantMessage with:
//   .content   — normalized: AssistantResponse (text, thinking, tool calls)
//   .usage     — normalized: token counts + cost breakdown
//   .message   — native: Anthropic Message / OpenAI Response / Google GenerateContentResponse
```

## The Response Model

Every response is a `BaseAssistantMessage<TApi>`:

```typescript
interface BaseAssistantMessage<TApi extends Api> {
  role: 'assistant';
  api: TApi;
  id: string;
  model: Model<TApi>;

  // Normalized fields — same shape across all providers
  content: AssistantResponse; // Array of response, thinking, and toolCall blocks
  usage: Usage; // Token counts + cost breakdown in USD
  stopReason: StopReason; // 'stop' | 'length' | 'toolUse' | 'error' | 'aborted'
  duration: number; // Response time in ms
  timestamp: number;

  // Native response — the provider's original, unmodified response object
  message: NativeResponseForApi<TApi>;
  //  'anthropic'   → Anthropic.Message
  //  'claude-code'  → Anthropic.Message
  //  'openai'      → OpenAI.Response
  //  'codex'       → OpenAI.Response
  //  'google'      → GenerateContentResponse
  //  'deepseek'    → ChatCompletion
  //  ...
}
```

## Streaming Events

The `stream()` function returns an `AssistantMessageEventStream` — an async iterable of typed events:

| Event                                                | Description                          |
| ---------------------------------------------------- | ------------------------------------ |
| `start`                                              | Stream opened, initial message shell |
| `text_start` / `text_delta` / `text_end`             | Text content lifecycle               |
| `thinking_start` / `thinking_delta` / `thinking_end` | Reasoning/thinking content           |
| `toolcall_start` / `toolcall_delta` / `toolcall_end` | Tool call with streaming arguments   |
| `done`                                               | Stream completed successfully        |
| `error`                                              | Stream ended with an error           |

Every event includes a `message` field with the in-progress `BaseAssistantMessage`, so you always have access to the accumulated state.

## Supported Providers

| Provider    | API           | SDK                 | Category          | Notes                                                   |
| ----------- | ------------- | ------------------- | ----------------- | ------------------------------------------------------- |
| Anthropic   | `anthropic`   | `@anthropic-ai/sdk` | Native SDK        | Interleaved thinking, cache control                     |
| OpenAI      | `openai`      | `openai`            | Native SDK        | Responses API, reasoning summaries                      |
| Google      | `google`      | `@google/genai`     | Native SDK        | Configurable thinking levels                            |
| DeepSeek    | `deepseek`    | `openai` (compat)   | OpenAI-compatible | Reasoning content, cache tokens                         |
| Kimi        | `kimi`        | `openai` (compat)   | OpenAI-compatible | Moonshot, per-choice usage                              |
| Z.AI        | `zai`         | `openai` (compat)   | OpenAI-compatible | Silent overflow handling                                |
| Claude Code | `claude-code` | `@anthropic-ai/sdk` | Backend-proxied   | OAuth + beta flag auth, billing header in system prompt |
| Codex       | `codex`       | `openai`            | Backend-proxied   | chatgpt-account-id auth, custom error rewriting         |

## Agent Loop

The package includes a stateless agent loop for building tool-using agents:

```typescript
import { runAgentLoop, buildUserMessage, stream, complete } from '@ank1015/llm-core';

const result = await runAgentLoop(
  {
    systemPrompt: 'You are a helpful assistant.',
    tools: myTools,
    provider: { model, providerOptions: { apiKey } },
    stream: stream,
    complete: complete,
    getQueuedMessages: async () => [],
  },
  [buildUserMessage('What is 2 + 2?')],
  (event) => console.log(event.type), // event emitter
  new AbortController().signal,
  {
    appendMessage: (msg) => messages.push(msg),
    appendMessages: (msgs) => messages.push(...msgs),
    addPendingToolCall: (id) => pending.add(id),
    removePendingToolCall: (id) => pending.delete(id),
  }
);
```

The agent loop handles the LLM call -> tool execution -> LLM call cycle. It's fully stateless — all state mutations go through the callbacks you provide.

## Custom Providers

Register any provider at runtime:

```typescript
import { registerProvider } from '@ank1015/llm-core';

registerProvider('my-provider', {
  stream: myStreamFunction,
  getMockNativeMessage: (modelId, requestId) => ({
    /* mock response */
  }),
});

// Now stream() and complete() work with your provider
const result = await complete(myModel, context, options, id);
```

For OpenAI-compatible providers, you can reuse the shared streaming engine. See [ADDING_PROVIDER.md](./ADDING_PROVIDER.md) for the full guide.

## Utilities

| Function                                     | Purpose                                |
| -------------------------------------------- | -------------------------------------- |
| `getModel(api, modelId)`                     | Look up a model by provider and ID     |
| `getModels(api)`                             | Get all models for a provider          |
| `calculateCost(model, usage)`                | Calculate cost from token counts       |
| `isContextOverflow(message, contextWindow?)` | Detect context window exceeded         |
| `validateToolArguments(tool, toolCall)`      | Validate tool call args against schema |
| `parseStreamingJson(partial)`                | Parse incomplete JSON during streaming |
| `sanitizeSurrogates(text)`                   | Remove unpaired Unicode surrogates     |

## Architecture

```
stream(model, context, options, id)
  │
  ├─ Registry lookup by model.api
  │
  ├─ Provider creates AssistantMessageEventStream
  │     │
  │     ├─ Pushes typed events as chunks arrive
  │     ├─ Accumulates content blocks
  │     └─ Ends with final BaseAssistantMessage
  │
  └─ complete() = stream().drain()
       (consumes all events, returns final message)
```

## License

MIT
