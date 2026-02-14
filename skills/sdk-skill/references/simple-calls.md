# Simple LLM Calls

## complete() — Non-streaming

```ts
import { complete, getModel } from '@ank1015/llm-sdk';

const model = getModel('anthropic', 'claude-sonnet-4-5')!;

const msg = await complete(
  model,
  {
    messages: [
      { role: 'user', id: '1', content: [{ type: 'text', content: 'Explain recursion' }] },
    ],
    systemPrompt: 'You are a helpful tutor.',
  },
  {
    providerOptions: { apiKey: 'sk-...' },
  }
);

console.log(msg.content); // AssistantResponse[]
console.log(msg.usage); // Usage { input, output, cacheRead, cacheWrite, totalTokens, cost }
console.log(msg.stopReason); // 'stop' | 'length' | 'toolUse' | 'error' | 'aborted'
```

### With KeysAdapter (no inline key)

```ts
import { complete, getModel } from '@ank1015/llm-sdk';
import { createFileKeysAdapter } from '@ank1015/llm-sdk-adapters';

const keysAdapter = createFileKeysAdapter(); // reads from ~/.llm/global/keys/
const model = getModel('openai', 'gpt-5.2')!;

const msg = await complete(
  model,
  {
    messages: [{ role: 'user', id: '1', content: [{ type: 'text', content: 'Hello' }] }],
  },
  { keysAdapter }
);
```

### With Usage Tracking

```ts
import { createFileKeysAdapter, createSqliteUsageAdapter } from '@ank1015/llm-sdk-adapters';

const msg = await complete(
  getModel('anthropic', 'claude-sonnet-4-5')!,
  { messages: [{ role: 'user', id: '1', content: [{ type: 'text', content: 'Hi' }] }] },
  { keysAdapter: createFileKeysAdapter(), usageAdapter: createSqliteUsageAdapter() }
);
// Usage automatically tracked in SQLite after completion
```

### CompleteOptions Shape

```ts
interface CompleteOptions<TApi extends Api> {
  providerOptions?: Partial<OptionsForApi<TApi>>; // provider-specific (apiKey, signal, etc.)
  keysAdapter?: KeysAdapter;
  usageAdapter?: UsageAdapter;
}
```

## stream() — Streaming

```ts
import { stream, getModel } from '@ank1015/llm-sdk';

const model = getModel('anthropic', 'claude-sonnet-4-5')!;

const eventStream = await stream(
  model,
  {
    messages: [{ role: 'user', id: '1', content: [{ type: 'text', content: 'Write a poem' }] }],
  },
  { providerOptions: { apiKey: 'sk-...' } }
);

// Consume events as they arrive
for await (const event of eventStream) {
  switch (event.type) {
    case 'text_delta':
      process.stdout.write(event.delta);
      break;
    case 'thinking_delta':
      // reasoning model thinking content
      break;
    case 'toolcall_end':
      console.log('Tool call:', event.toolCall);
      break;
    case 'done':
      console.log('\nDone:', event.reason);
      break;
    case 'error':
      console.error('Error:', event.reason);
      break;
  }
}

// Get the final assembled message (includes usage)
const finalMessage = await eventStream.result();
console.log(finalMessage.usage.cost.total);
```

### drain() — Skip Event Processing

```ts
const eventStream = await stream(model, context, options);
const finalMessage = await eventStream.drain();
// Consumes all events, returns final message. Throws on error/abort.
```

### StreamOptions Shape

Same as `CompleteOptions`:

```ts
interface StreamOptions<TApi extends Api> {
  providerOptions?: Partial<OptionsForApi<TApi>>;
  keysAdapter?: KeysAdapter;
  usageAdapter?: UsageAdapter;
}
```

`stream()` is async because credential resolution may be async. The returned `AssistantMessageEventStream` is an `AsyncIterable`.

## Building Context

```ts
interface Context {
  messages: Message[]; // conversation history
  systemPrompt?: string; // system instructions
  tools?: Tool[]; // available tools (schema only, no execute fn)
}
```

## Credential Resolution Order

Both `complete()` and `stream()` resolve credentials per-field:

1. Explicit value in `providerOptions`
2. `keysAdapter.getCredentials(api)` for multi-field providers
3. `keysAdapter.get(api)` fallback for apiKey
4. Throws `ApiKeyNotFoundError` if missing

## With Tools (non-agent, manual loop)

```ts
import { Type } from '@sinclair/typebox';

const msg = await complete(
  model,
  {
    messages: [{ role: 'user', id: '1', content: [{ type: 'text', content: 'What time is it?' }] }],
    tools: [
      {
        name: 'get_time',
        description: 'Get the current time',
        parameters: Type.Object({ timezone: Type.String() }),
      },
    ],
  },
  { providerOptions: { apiKey: 'sk-...' } }
);

if (msg.stopReason === 'toolUse') {
  const toolCalls = msg.content.filter((c) => c.type === 'toolCall');
  // Handle tool calls manually...
}
```

For automatic tool execution loops, use the [Conversation class](conversation.md).
