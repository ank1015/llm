# One-Off Calls

Use this reference when the task is a single request/response flow rather than a stateful agent loop.

## Contents

- [Public Imports](#public-imports)
- [Discover a Model](#discover-a-model)
- [Canonical Credential Path](#canonical-credential-path)
- [`complete()`](#complete)
- [`stream()`](#stream)
- [Consume Stream Events](#consume-stream-events)
- [Extract Normalized Text](#extract-normalized-text)

## Public Imports

```ts
import { complete, stream, getModel, getModels } from '@ank1015/llm-sdk';
import { createFileKeysAdapter } from '@ank1015/llm-sdk-adapters';

import type {
  Api,
  AssistantMessageEventStream,
  BaseAssistantMessage,
  CompleteOptions,
  Context,
  Model,
  StreamOptions,
} from '@ank1015/llm-sdk';
```

Prefer importing types from `@ank1015/llm-sdk` because the package already re-exports the public SDK types.

## Discover a Model

Use `getModel(api, modelId)` when the task already names the provider and model:

```ts
const model = getModel('anthropic', 'claude-haiku-4-5');
if (!model) {
  throw new Error('Model not found');
}
```

Use `getModels(api)` when the task needs to inspect available models first:

```ts
const models = getModels('openai');
const ids = models.map((entry) => entry.id);
```

Treat the exported model list as the source of truth instead of hardcoding assumptions from memory.

## Canonical Credential Path

Use a file keys adapter and pass it into SDK calls:

```ts
const keysAdapter = createFileKeysAdapter();
```

For normal task code:

- do not read credentials from `process.env`
- do not thread `providerOptions.apiKey` through every call
- let the SDK resolve credentials through `keysAdapter`

For multi-field providers such as `codex` or `claude-code`, keep using the same call sites. The SDK resolves the required credential bundle from the adapter.

## `complete()`

Use `complete()` when the task wants one final message and does not need incremental stream events.

```ts
const model = getModel('anthropic', 'claude-haiku-4-5');
if (!model) {
  throw new Error('Model not found');
}

const keysAdapter = createFileKeysAdapter();

const context: Context = {
  systemPrompt: 'You are a concise assistant.',
  messages: [
    {
      role: 'user',
      id: 'user-1',
      content: [{ type: 'text', content: 'Summarize this diff in 3 bullets.' }],
    },
  ],
};

const message = await complete(model, context, {
  keysAdapter,
});
```

Important public types:

- `Model<TApi>`: provider-specific model definition
- `Context`: request context with `messages` plus optional `systemPrompt` and `tools`
- `CompleteOptions<TApi>`: call options; use `keysAdapter` as the main option in this skill
- `BaseAssistantMessage<TApi>`: final normalized assistant message

## `stream()`

Use `stream()` when the task needs incremental assistant output for CLI, UI, or live logs.

```ts
const model = getModel('openai', 'gpt-5-mini');
if (!model) {
  throw new Error('Model not found');
}

const keysAdapter = createFileKeysAdapter();

const context: Context = {
  messages: [
    {
      role: 'user',
      id: 'user-1',
      content: [{ type: 'text', content: 'Draft a short release note.' }],
    },
  ],
};

const eventStream = await stream(model, context, {
  keysAdapter,
});
```

Important public types:

- `StreamOptions<TApi>`
- `AssistantMessageEventStream<TApi>`
- `BaseAssistantMessage<TApi>`

`stream()` is async because credential lookup may need adapter reads before the stream can start.

## Consume Stream Events

```ts
for await (const event of eventStream) {
  if (event.type === 'text_delta') {
    process.stdout.write(event.delta);
  }
}

const finalMessage = await eventStream.result();
```

Use `.result()` to obtain the final `BaseAssistantMessage<TApi>` after the stream finishes.

## Extract Normalized Text

Assistant output is stored in normalized `message.content`, not as a single plain string. A practical helper:

```ts
function getAssistantText(message: BaseAssistantMessage<Api>): string {
  const lines: string[] = [];

  for (const block of message.content) {
    if (block.type !== 'response') {
      continue;
    }

    for (const part of block.content) {
      if (part.type === 'text') {
        lines.push(part.content);
      }
    }
  }

  return lines.join('\n').trim();
}
```

This keeps the code provider-neutral because it reads the SDK's normalized assistant response shape instead of provider-native response bodies.
