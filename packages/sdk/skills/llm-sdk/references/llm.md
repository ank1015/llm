# `llm()`

The function for making one time LLM calls.

```ts
import { getText, llm, userMessage } from '@ank1015/llm-sdk';
```

---

## Basic usage

```ts
const message = await llm({
  modelId: 'anthropic/claude-sonnet-4-6',
  messages: [userMessage('What is 2 + 2?')],
});

console.log(message.content); // AssistantResponse array
```

`await llm(...)` returns the final `BaseAssistantMessage` once the model finishes.

---

## Streaming

`llm()` returns a `LlmRun` — you can either `await` it for the final message, or iterate it for live events:

```ts
const run = llm({
  modelId: 'anthropic/claude-sonnet-4-6',
  messages,
});

for await (const event of run) {
  if (event.type === 'text_delta') {
    process.stdout.write(event.delta);
  }
}

// After iteration, await for the final message
const message = await run;
```

You can also just `await run.drain()` to consume all events and get the final message without handling each event.

Important: a run only has one event-stream consumer. The supported patterns are:

- `await llm(...)`
- `const run = llm(...); for await (const event of run) { ... } const message = await run`

If `await` / `.then()` / `.drain()` claims the run first, later iteration will throw instead of silently dropping events.

---

## Input

```ts
type LlmInput<TModelId extends CuratedModelId = CuratedModelId> = {
  modelId: TModelId; // which model to use
  messages: Message[]; // conversation history
  system?: string; // system prompt
  tools?: Tool[]; // tools the model can call
  reasoningEffort?: ReasoningEffort; // 'low' | 'medium' | 'high' | 'xhigh'
  overrideProviderSetting?: Partial<ProviderOptionsForModelId<TModelId>>;
  keysFilePath?: string; // custom path to keys file (see Setup)
  signal?: AbortSignal; // cancel the request
  requestId?: string; // id for the assistant message (auto-generated if omitted)
};
```

### `modelId`

Pick one of the supported model IDs:

| Provider      | Model IDs                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------ |
| `openai`      | `openai/gpt-5.4`, `openai/gpt-5.4-pro`, `openai/gpt-5.4-mini`, `openai/gpt-5.4-nano`, `openai/gpt-5.3-codex` |
| `codex`       | `codex/gpt-5.4`, `codex/gpt-5.4-mini`, `codex/gpt-5.3-codex`, `codex/gpt-5.3-codex-spark`                    |
| `anthropic`   | `anthropic/claude-opus-4-6`, `anthropic/claude-sonnet-4-6`                                                   |
| `claude-code` | `claude-code/claude-opus-4-6`, `claude-code/claude-sonnet-4-6`                                               |
| `google`      | `google/gemini-3.1-pro-preview`, `google/gemini-3-flash-preview`, `google/gemini-3.1-flash-lite-preview`     |

Import `CuratedModelId` if you need the TypeScript type.

### `messages`

The conversation history as a `Message[]`. See [types.md](./types.md) for the full `Message` shape.

For a simple one-off call, just pass a single user message:

```ts
messages: [userMessage('Hello')];
```

`userMessage()` is the easiest way to build user messages because it generates a unique `id` for you. If you need full control, you can still pass a raw `UserMessage` object.

For multi-turn conversations, include the full history — user messages, assistant messages (from previous `llm()` calls), and tool result messages.

### `system`

Optional system prompt string.

```ts
system: 'You are a helpful assistant that responds only in Spanish.';
```

### `tools`

Optional array of `Tool` objects. When provided, the model may respond with tool calls instead of (or alongside) text.

`llm()` does **not** execute tools. It only sends the tool definitions to the model. If the model calls a tool, you'll see it in the response's `.content` array as an `AssistantToolCall` item, and you handle execution yourself.

See [types.md](./types.md) for the `Tool` type and the `tool()` helper for defining tools with an `execute` method.

### `reasoningEffort`

For models that support reasoning/thinking, controls how much the model reasons before responding.

```ts
type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh';
```

Notes:

- `openai` and `codex`: if omitted, no standardized reasoning setting is added.
- `anthropic` and `claude-code`: this SDK always enables adaptive thinking for the supported Claude 4.6 models. `reasoningEffort` sets the adaptive effort level. If omitted, adaptive thinking is still enabled and the provider default effort is used.
- `google`: if omitted, no explicit thinking level is added and the provider default applies.

### `overrideProviderSetting`

Pass provider-specific options not covered by the standard interface.

```ts
import type { ProviderOptionsForModelId } from '@ank1015/llm-sdk';

overrideProviderSetting: {
  max_tokens: 256,
} satisfies Partial<ProviderOptionsForModelId<'anthropic/claude-sonnet-4-6'>>
```

If you call `llm({...})` with a literal `modelId`, TypeScript will usually infer the correct provider-specific type for `overrideProviderSetting` automatically.

### `keysFilePath`

By default the SDK reads credentials from `~/.llm-sdk/keys.env`. Pass a custom path here to override it.

---

## Return value — `LlmRun`

```ts
interface LlmRun extends AsyncIterable<BaseAssistantEvent>, PromiseLike<BaseAssistantMessage> {
  drain(): Promise<BaseAssistantMessage>;
}
```

Three ways to consume a `LlmRun`:

```ts
// 1. Await the final message (no streaming)
const message = await llm({ ... });

// 2. Stream events, then get the final message
const run = llm({ ... });
for await (const event of run) { /* handle events */ }
const message = await run;

// 3. Drain all events silently, get the final message
const message = await llm({ ... }).drain();
```

Do not start `await run` and `for await (const event of run)` at the same time.

---

## The final `BaseAssistantMessage`

```ts
interface BaseAssistantMessage {
  role: 'assistant';
  id: string;
  model: Model;
  api: string;
  timestamp: number; // Unix ms
  duration: number; // ms
  stopReason: 'stop' | 'length' | 'toolUse' | 'error' | 'aborted';
  content: AssistantResponse;
  usage: Usage;
}

// AssistantResponse is what the model produced
type AssistantResponse = Array<
  | { type: 'response'; response: Content } // text/image output
  | { type: 'thinking'; thinkingText: string } // reasoning trace (if enabled)
  | { type: 'toolCall'; name: string; arguments: Record<string, unknown>; toolCallId: string }
>;

interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number; // USD
  };
}
```

### Reading text from the response

```ts
import { getText } from '@ank1015/llm-sdk';

const message = await llm({ ... });

console.log(getText(message));
```

`getText()` accepts either the full `BaseAssistantMessage` or just `message.content`.

### Reading thinking from the response

```ts
import { getThinking } from '@ank1015/llm-sdk';

const message = await llm({ ... });

console.log(getThinking(message));
```

### Reading tool calls from the response

```ts
import { getToolCalls, toolResultMessage } from '@ank1015/llm-sdk';

for (const toolCall of getToolCalls(message)) {
  console.log(toolCall.name); // e.g. "get_weather"
  console.log(toolCall.arguments); // e.g. { city: "London" }
  console.log(toolCall.toolCallId); // use this when building ToolResultMessage
}
```

If you are handling a manual tool loop with `llm()`, use `toolResultMessage()` to build the follow-up `ToolResultMessage` without hand-writing `id` and `timestamp`:

```ts
const toolResult = toolResultMessage({
  toolCall,
  content: [{ type: 'text', content: '72F, sunny' }],
});
```

---

## Streaming events — `BaseAssistantEvent`

When iterating a `LlmRun`, each event has a `type` field:

```ts
type BaseAssistantEvent =
  | { type: 'start'; message: BaseAssistantMessage }
  | { type: 'text_start'; contentIndex: number; message: BaseAssistantMessage }
  | { type: 'text_delta'; contentIndex: number; delta: string; message: BaseAssistantMessage }
  | { type: 'text_end'; contentIndex: number; content: Content; message: BaseAssistantMessage }
  | { type: 'thinking_start'; contentIndex: number; message: BaseAssistantMessage }
  | { type: 'thinking_delta'; contentIndex: number; delta: string; message: BaseAssistantMessage }
  | { type: 'thinking_end'; contentIndex: number; content: string; message: BaseAssistantMessage }
  | { type: 'toolcall_start'; contentIndex: number; message: BaseAssistantMessage }
  | { type: 'toolcall_delta'; contentIndex: number; delta: string; message: BaseAssistantMessage }
  | {
      type: 'toolcall_end';
      contentIndex: number;
      toolCall: AssistantToolCall;
      message: BaseAssistantMessage;
    }
  | { type: 'done'; reason: 'stop' | 'length' | 'toolUse'; message: BaseAssistantMessage }
  | { type: 'error'; reason: 'aborted' | 'error'; message: BaseAssistantMessage };
```

Every event carries the current (possibly partial) `message`. The `message` on `done`/`error` is the final state.

### Common streaming pattern

```ts
for await (const event of run) {
  switch (event.type) {
    case 'text_delta':
      process.stdout.write(event.delta);
      break;
    case 'toolcall_end':
      console.log('Tool call:', event.toolCall.name, event.toolCall.arguments);
      break;
    case 'done':
      console.log('Stop reason:', event.reason);
      break;
    case 'error':
      console.error('Stream error:', event.reason);
      break;
  }
}
```

---

## Setup — credentials

The SDK reads API keys from a file at `~/.llm-sdk/keys.env` by default.

Use `keysFilePath` in `LlmInput` to point to a different keys file when needed.

```env
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
```

---

## Errors

`await llm(...)` throws if:

- the `modelId` is not a recognized value
- credentials for the chosen provider are missing from the keys file
- the provider API returns an error

Setup failures (bad model ID, missing key) throw `LlmInputError`:

```ts
import { LlmInputError } from '@ank1015/llm-sdk';

try {
  const message = await llm({ modelId: 'anthropic/claude-sonnet-4-6', messages });
} catch (e) {
  if (e instanceof LlmInputError) {
    console.error(e.code); // e.g. 'missing_credentials'
    console.error(e.modelId);
  }
}
```
