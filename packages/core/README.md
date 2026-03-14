# @ank1015/llm-core

Stateless multi-provider LLM runtime for TypeScript. It gives you one execution model across providers while still preserving each provider's native request options and response payloads.

## Why this package exists

- Keep provider-native options intact instead of forcing every provider into one flattened config type.
- Normalize the parts that are useful to share across providers: messages, usage, stop reasons, and streaming events.
- Centralize runtime concerns in one package: model catalog, provider registry, streaming/completion dispatch, and the stateless agent loop.

`@ank1015/llm-core` builds on top of `@ank1015/llm-types`, which owns the shared contracts.

## Installation

```bash
pnpm add @ank1015/llm-core
```

## Quick start

### Streaming

```ts
import { getModel, stream } from '@ank1015/llm-core';

const model = getModel('anthropic', 'claude-sonnet-4-6');

if (!model) {
  throw new Error('Model not found');
}

const eventStream = stream(
  model,
  {
    messages: [
      {
        role: 'user',
        id: 'msg-1',
        content: [{ type: 'text', content: 'Hello!' }],
      },
    ],
  },
  { apiKey: process.env.ANTHROPIC_API_KEY! },
  'request-1'
);

for await (const event of eventStream) {
  if (event.type === 'text_delta') {
    process.stdout.write(event.delta);
  }
}

const message = await eventStream.result();
console.log(message.usage.cost.total);
```

### Non-streaming

```ts
import { complete, getModel } from '@ank1015/llm-core';

const model = getModel('openai', 'gpt-5.4');

if (!model) {
  throw new Error('Model not found');
}

const message = await complete(
  model,
  {
    messages: [
      {
        role: 'user',
        id: 'msg-1',
        content: [{ type: 'text', content: 'Summarize this package in one sentence.' }],
      },
    ],
  },
  { apiKey: process.env.OPENAI_API_KEY! },
  'request-2'
);

console.log(message.content);
console.log(message.message);
```

### Switching providers

```ts
import { complete, getModel } from '@ank1015/llm-core';

const anthropicModel = getModel('anthropic', 'claude-sonnet-4-6');
const openaiModel = getModel('openai', 'gpt-5.4');
const googleModel = getModel('google', 'gemini-3.1-pro-preview');

if (!anthropicModel || !openaiModel || !googleModel) {
  throw new Error('One or more models were not found');
}

const anthropicResult = await complete(anthropicModel, context, { apiKey: ANTHROPIC_KEY }, id);
const openaiResult = await complete(openaiModel, context, { apiKey: OPENAI_KEY }, id);
const googleResult = await complete(googleModel, context, { apiKey: GOOGLE_KEY }, id);
```

The execution flow stays the same. What changes is the provider-specific options object and the native `message` payload on the result.

## Response model

Every completion resolves to `BaseAssistantMessage<TApi>`:

- `content`: normalized assistant blocks (`response`, `thinking`, `toolCall`)
- `usage`: normalized token and cost accounting
- `stopReason`: normalized stop reason
- `message`: the native provider response object

This lets UI and agent code work against the shared surface while still preserving provider-specific details when you need them.

## Streaming events

`stream()` returns an `AssistantMessageEventStream`, which is both:

- an async iterable of events
- a `.result()` promise for the final `BaseAssistantMessage`

Current event families:

- `start`
- `text_start`, `text_delta`, `text_end`
- `thinking_start`, `thinking_delta`, `thinking_end`
- `image_start`, `image_frame`, `image_end`
- `toolcall_start`, `toolcall_delta`, `toolcall_end`
- `done`
- `error`

Each event carries the in-progress `message`, so consumers can render partial state without waiting for the final response.

## Supported providers

| Provider    | API           | Runtime family                 | Notes                                       |
| ----------- | ------------- | ------------------------------ | ------------------------------------------- |
| Anthropic   | `anthropic`   | Native SDK                     | Custom stream implementation                |
| Claude Code | `claude-code` | Anthropic-style backend proxy  | OAuth token, beta flag, billing header      |
| OpenAI      | `openai`      | Native SDK                     | Responses API, text + image streaming       |
| Codex       | `codex`       | OpenAI Responses backend proxy | `chatgpt-account-id`, custom error handling |
| Google      | `google`      | Native SDK                     | Gemini text + image generation              |
| DeepSeek    | `deepseek`    | Shared chat-completions engine | OpenAI-compatible                           |
| Kimi        | `kimi`        | Shared chat-completions engine | OpenAI-compatible, reasoning config         |
| Z.AI        | `zai`         | Shared chat-completions engine | OpenAI-compatible, thinking config          |
| Cerebras    | `cerebras`    | Shared chat-completions engine | OpenAI-compatible, reasoning controls       |
| OpenRouter  | `openrouter`  | Shared chat-completions engine | OpenAI-compatible meta-router               |
| MiniMax     | `minimax`     | Anthropic-compatible stream    | Anthropic wire format, custom client        |

## Agent loop

The package also ships a stateless tool-using agent runner:

```ts
import { buildUserMessage, complete, runAgentLoop, stream } from '@ank1015/llm-core';

const result = await runAgentLoop(
  {
    systemPrompt: 'You are a helpful assistant.',
    tools: myTools,
    provider: { model, providerOptions: { apiKey } },
    stream,
    complete,
    getQueuedMessages: async () => [],
  },
  [buildUserMessage('What is 2 + 2?')],
  (event) => console.log(event.type),
  new AbortController().signal,
  {
    appendMessage: (message) => messages.push(message),
    appendMessages: (newMessages) => messages.push(...newMessages),
    addPendingToolCall: (toolCallId) => pending.add(toolCallId),
    removePendingToolCall: (toolCallId) => pending.delete(toolCallId),
  }
);
```

State stays outside the core loop. The runner only orchestrates LLM calls, tool execution, and event emission.

## Development commands

Run these from the monorepo root:

```bash
pnpm --filter @ank1015/llm-core lint
pnpm --filter @ank1015/llm-core typecheck
pnpm --filter @ank1015/llm-core build
pnpm --filter @ank1015/llm-core test:unit
pnpm --filter @ank1015/llm-core test:integration
pnpm --filter @ank1015/llm-core test:coverage
```

`test:integration` only runs suites whose required credentials are available and executes them sequentially.

## More docs

- [Core docs index](https://github.com/ank1015/llm/blob/main/packages/core/docs/README.md)
- [Architecture](https://github.com/ank1015/llm/blob/main/packages/core/docs/architecture.md)
- [Providers](https://github.com/ank1015/llm/blob/main/packages/core/docs/providers.md)
- [Testing](https://github.com/ank1015/llm/blob/main/packages/core/docs/testing.md)
- [Adding a provider](https://github.com/ank1015/llm/blob/main/packages/core/ADDING_PROVIDER.md)

## License

MIT
