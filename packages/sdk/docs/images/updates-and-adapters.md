# Updates and Adapters

This guide explains live update callbacks, `provider.apiKey`, `keysAdapter`, and `usageAdapter`.

## `onUpdate`

If you pass `onUpdate`, the SDK calls it whenever it saves an image update artifact.

The callback receives:

```ts
{
  stage: 'partial' | 'thought' | 'final';
  path: string;
  mimeType: string;
  index: number;
  model: ImageModelId;
}
```

## What Counts as an Update

The SDK only reports saved image artifacts.

That means:

- OpenAI partial previews can trigger updates
- Google thought images can trigger updates
- the first final image triggers an update artifact too

The API does not surface text deltas or reasoning text here.

## Example

```ts
await createImage({
  provider: {
    model: 'gpt-5.4',
    apiKey: process.env.OPENAI_API_KEY!,
    imageOptions: {
      partialImages: 2,
      size: '1024x1024',
    },
  },
  prompt: 'Draw a serene winter river made of white owl feathers.',
  outputDir: './output',
  onUpdate: async (update) => {
    console.log(update.stage, update.path);
  },
});
```

## `provider.apiKey`

The simplest auth path is to pass `apiKey` directly inside `provider`:

```ts
await createImage({
  provider: {
    model: 'gpt-5.4',
    apiKey: process.env.OPENAI_API_KEY!,
  },
  prompt: 'Generate a white horse.',
  outputDir: './output',
});
```

## `keysAdapter`

If you do not want to pass `apiKey` directly, use a `KeysAdapter`.

Example with the Node adapters package:

```ts
import { createImage } from '@ank1015/llm-sdk';
import { createFileKeysAdapter } from '@ank1015/llm-sdk-adapters';

const keysAdapter = createFileKeysAdapter();
await keysAdapter.set('google', process.env.GEMINI_API_KEY!);

await createImage({
  provider: {
    model: 'gemini-3-pro-image-preview',
  },
  prompt: 'Generate a white horse.',
  outputDir: './output',
  keysAdapter,
});
```

Credential precedence is:

1. `provider.apiKey`
2. `keysAdapter`

## `usageAdapter`

If you pass a `usageAdapter`, the SDK tracks the final assistant message usage automatically.

```ts
import { createImage } from '@ank1015/llm-sdk';
import { createSqliteUsageAdapter } from '@ank1015/llm-sdk-adapters';

const usageAdapter = createSqliteUsageAdapter();

await createImage({
  provider: {
    model: 'gpt-5.4',
    apiKey: process.env.OPENAI_API_KEY!,
  },
  prompt: 'Generate a white horse.',
  outputDir: './output',
  usageAdapter,
});
```

## What This API Does Not Include

This image API intentionally does not include:

- session manager integration
- multi-turn memory
- stateful conversations
- raw provider request escape hatches

If you want one-shot image tasks with saved files, these functions are the intended high-level SDK surface.
