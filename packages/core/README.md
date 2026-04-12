# @ank1015/llm-core

Stateless multi-provider runtime for LLM chat, image generation, music generation, video generation, preserved native provider responses, and a lightweight agent loop.

## What You Get

- A single `stream()` entry point for built-in providers
- `complete()` built on top of the same streaming path
- A dedicated `generateImage()` entry point for built-in image providers
- A dedicated `generateMusic()` entry point for built-in music providers
- A dedicated `generateVideo()` entry point for built-in video providers
- Typed model catalogs and helpers like `getModel()`, `getModels()`, and `calculateCost()`
- Typed image model helpers like `getImageModel()`, `getImageModels()`, `getImageProviders()`, and `calculateImageCost()`
- Typed music model helpers like `getMusicModel()`, `getMusicModels()`, `getMusicProviders()`, and `calculateMusicCost()`
- Typed video model helpers like `getVideoModel()`, `getVideoModels()`, `getVideoProviders()`, and `calculateVideoCost()`
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

## Supported Image Providers

- OpenAI Images API: `gpt-image-1.5`
- Google Gemini native image generation: `gemini-3.1-flash-image-preview`, `gemini-3-pro-image-preview`

Image-provider notes and the image runtime surface are documented in [docs/images.md](./docs/images.md).

## Supported Music Providers

- Google Lyria: `lyria-3-clip-preview`, `lyria-3-pro-preview`

Music-provider notes and the music runtime surface are documented in [docs/music.md](./docs/music.md).

## Supported Video Providers

- Google Veo: `veo-3.1-generate-preview`, `veo-3.1-fast-generate-preview`, `veo-3.1-lite-generate-preview`

Video-provider notes and the video runtime surface are documented in [docs/videos.md](./docs/videos.md).

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

## Image Generation

`generateImage()` is a separate non-streaming runtime for image providers. It returns normalized `content`, an `images` convenience array, normalized image usage with computed `usage.cost`, and the preserved provider-native response.

```ts
import { generateImage, getImageModel } from '@ank1015/llm-core';

const model = getImageModel('openai', 'gpt-image-1.5');

if (!model) {
  throw new Error('Image model not found');
}

const result = await generateImage(
  model,
  {
    prompt: 'Create a studio product shot of a silver robot watering a bonsai tree.',
  },
  {
    apiKey: process.env.OPENAI_API_KEY!,
    background: 'transparent',
    quality: 'high',
  },
  'img-1'
);

console.log(result.images[0]?.mimeType);
console.log(result.usage.totalTokens);
console.log(result.usage.cost.total);
console.log(result.response);
```

Google image generation uses the same `generateImage()` surface, but may return both text and image blocks in `result.content`.

Image usage comes from the provider-native response. Image cost is derived locally from the built-in image model pricing with `calculateImageCost()`.

## Music Generation

`generateMusic()` is a separate non-streaming runtime for music providers. It returns normalized `content`, a `tracks` convenience array, normalized music usage with request-based `usage.cost`, and the preserved provider-native response.

```ts
import { generateMusic, getMusicModel } from '@ank1015/llm-core';

const model = getMusicModel('google', 'lyria-3-pro-preview');

if (!model) {
  throw new Error('Music model not found');
}

const result = await generateMusic(
  model,
  {
    prompt: 'An atmospheric ambient track with soft piano, distant choir, and a slow build.',
  },
  {
    apiKey: process.env.GEMINI_API_KEY!,
    responseMimeType: 'audio/wav',
  },
  'music-1'
);

console.log(result.tracks[0]?.mimeType);
console.log(result.usage.totalTokens);
console.log(result.usage.cost.total);
console.log(result.response);
```

Google Lyria uses `generateContent()` and may return lyrics or structural notes as text blocks alongside the generated audio track. Music cost is derived locally from the built-in per-request model pricing with `calculateMusicCost()`.

## Video Generation

`generateVideo()` is a separate non-streaming runtime for video providers. It waits for long-running provider operations to complete, then returns normalized `videos`, the preserved operation, the preserved provider-native response, and normalized video usage with estimated `usage.cost` when model pricing is available.

```ts
import { generateVideo, getVideoModel } from '@ank1015/llm-core';

const model = getVideoModel('google', 'veo-3.1-generate-preview');

if (!model) {
  throw new Error('Video model not found');
}

const result = await generateVideo(
  model,
  {
    prompt: 'A slow cinematic drone reveal of a misty rainforest waterfall at sunrise.',
  },
  {
    apiKey: process.env.GEMINI_API_KEY!,
    aspectRatio: '16:9',
    durationSeconds: 4,
    pollIntervalMs: 5000,
  },
  'video-1'
);

console.log(result.videos[0]?.uri);
console.log(result.operation.done);
console.log(result.usage.cost?.total);
console.log(result.response);
```

Google Veo does not currently expose provider-native usage metadata for this runtime, so core estimates `usage.cost` from the built-in per-second model pricing plus the resolved request settings like `durationSeconds`, `resolution`, and `numberOfVideos`.

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
