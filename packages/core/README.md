# @ank1015/llm-core

Stateless multi-provider LLM runtime with normalized streaming events, preserved native provider responses, and a lightweight agent loop.

## What You Get

- A single `stream()` entry point for built-in providers
- `complete()` built on top of the same streaming path
- Typed model catalogs and helpers like `getModel()`, `getModels()`, and `calculateCost()`
- A normalized assistant message format with text, reasoning, tool-call, and usage blocks
- A small stateless agent engine with tool execution, retries, hooks, and adapter helpers

## Installation

```bash
pnpm add @ank1015/llm-core @sinclair/typebox
```

## Supported Providers

- OpenAI
- Codex
- Google
- DeepSeek
- Anthropic
- Claude Code
- Z.AI
- Kimi
- MiniMax
- Cerebras
- OpenRouter

Provider auth notes and integration-test env vars are documented in [docs/providers.md](./docs/providers.md).

## Quick Start

```ts
import { complete, getModel } from '@ank1015/llm-core';

const model = getModel('openai', 'gpt-5.4');

if (!model) {
  throw new Error('Model not found');
}

const result = await complete(
  model,
  {
    systemPrompt: 'You are a concise assistant.',
    messages: [
      {
        role: 'user',
        id: 'user-1',
        content: [{ type: 'text', content: 'Explain event sourcing in one paragraph.' }],
      },
    ],
  },
  { apiKey: process.env.OPENAI_API_KEY! },
  'msg-1'
);

console.log(result.stopReason);
console.log(result.usage.totalTokens);
console.log(result.content);
```

## Streaming

`stream()` returns an async event stream with normalized lifecycle events and a `result()`/`drain()` helper.

```ts
import { getModel, stream } from '@ank1015/llm-core';

const model = getModel('google', 'gemini-2.5-flash');

if (!model) {
  throw new Error('Model not found');
}

const assistantStream = stream(
  model,
  {
    messages: [
      {
        role: 'user',
        id: 'user-1',
        content: [{ type: 'text', content: 'List three practical uses of Web Streams.' }],
      },
    ],
  },
  { apiKey: process.env.GEMINI_API_KEY! },
  'msg-2'
);

for await (const event of assistantStream) {
  if (event.type === 'text_delta') {
    process.stdout.write(event.delta);
  }
}

const finalMessage = await assistantStream.result();
console.log(finalMessage.usage.cost.total);
```

The normalized event model includes:

- `start`
- `text_start`, `text_delta`, `text_end`
- `thinking_start`, `thinking_delta`, `thinking_end`
- `toolcall_start`, `toolcall_delta`, `toolcall_end`
- `done`
- `error`

See the canonical message and event contracts in [src/types/message.ts](./src/types/message.ts).

## Model Catalog

The package root pre-registers built-in providers and exports model helpers:

```ts
import { calculateCost, getModel, getModels, getProviders } from '@ank1015/llm-core';

const providers = getProviders();
const openaiModels = getModels('openai');
const model = getModel('anthropic', 'claude-sonnet-4');

if (model) {
  const cost = calculateCost(model, {
    input: 1000,
    output: 250,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 1250,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  });

  console.log(providers.length, openaiModels.length, cost.total);
}
```

## Tool Calling

Tools are defined with TypeBox schemas and passed through `Context.tools`.

```ts
import { Type } from '@sinclair/typebox';
import { complete, getModel } from '@ank1015/llm-core';

const model = getModel('openai', 'gpt-5.4');

if (!model) {
  throw new Error('Model not found');
}

const result = await complete(
  model,
  {
    messages: [
      {
        role: 'user',
        id: 'user-1',
        content: [{ type: 'text', content: 'Call get_weather for Tokyo.' }],
      },
    ],
    tools: [
      {
        name: 'get_weather',
        description: 'Get the current weather for a location.',
        parameters: Type.Object({
          location: Type.String(),
        }),
      },
    ],
  },
  { apiKey: process.env.OPENAI_API_KEY! },
  'msg-3'
);

const toolCall = result.content.find((block) => block.type === 'toolCall');
console.log(toolCall);
```

## File Inputs

User messages and tool results can include base64-encoded files. Core's integration suite covers PDF-grounded flows for OpenAI, Google, Anthropic, and Codex.

```ts
import { complete, getModel } from '@ank1015/llm-core';
import fs from 'node:fs';

const model = getModel('openai', 'gpt-5.4');

if (!model) {
  throw new Error('Model not found');
}

const pdfBase64 = fs.readFileSync('./paper.pdf').toString('base64');

const result = await complete(
  model,
  {
    messages: [
      {
        role: 'user',
        id: 'user-1',
        content: [
          {
            type: 'file',
            data: pdfBase64,
            mimeType: 'application/pdf',
            filename: 'paper.pdf',
          },
          {
            type: 'text',
            content: 'Read the PDF and summarize the main idea in two sentences.',
          },
        ],
      },
    ],
  },
  { apiKey: process.env.OPENAI_API_KEY! },
  'msg-4'
);
```

## Agent Engine

The root export also includes a stateless agent engine, helper builders, and the default streaming-backed model invoker.

```ts
import { Type } from '@sinclair/typebox';
import { buildUserMessage, defaultModelInvoker, getModel, runAgent } from '@ank1015/llm-core';

const model = getModel('anthropic', 'claude-haiku-4-5');

if (!model) {
  throw new Error('Model not found');
}

const result = await runAgent(
  {
    provider: {
      model,
      providerOptions: {
        apiKey: process.env.ANTHROPIC_API_KEY!,
      },
    },
    modelInvoker: defaultModelInvoker,
    systemPrompt: 'You are a careful research assistant.',
    tools: [
      {
        name: 'get_weather',
        description: 'Return weather for a city.',
        parameters: Type.Object({
          city: Type.String(),
        }),
        async execute({ params }) {
          return {
            content: [{ type: 'text', content: `Weather for ${params.city}: sunny` }],
          };
        },
      },
    ],
  },
  {
    messages: [buildUserMessage('Use the weather tool for Tokyo and then answer.')],
    totalCost: 0,
    totalTokens: 0,
    turns: 0,
  }
);

console.log(result.state.messages);
```

## Advanced Provider Registration

The package root exports `registerProvider()` for advanced integrations that need to add a provider to the runtime registry.

```ts
import { registerProvider } from '@ank1015/llm-core';

registerProvider('my-provider', {
  stream: myProviderStream,
  getMockNativeMessage: () => ({}),
});
```

## Validation

Core now ships with a release-safe validation command:

```bash
pnpm --filter @ank1015/llm-core release:check
```

That runs:

- build
- typecheck
- lint
- unit tests
- coverage

Live provider integration tests remain available through:

```bash
pnpm --filter @ank1015/llm-core test:integration
```

The full release checklist lives in [docs/testing-and-release.md](./docs/testing-and-release.md).
