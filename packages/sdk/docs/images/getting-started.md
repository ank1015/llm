# Getting Started

This guide shows the fastest way to use the SDK image functions.

## Install

Install the SDK:

```bash
npm install @ank1015/llm-sdk
```

If you also want ready-made Node.js adapters for API keys or usage tracking:

```bash
npm install @ank1015/llm-sdk-adapters
```

## Import

```ts
import { createImage, editImage } from '@ank1015/llm-sdk';
```

## Your First Image

```ts
import { createImage } from '@ank1015/llm-sdk';

const result = await createImage({
  provider: {
    model: 'gpt-5.4',
    apiKey: process.env.OPENAI_API_KEY!,
  },
  prompt: 'Generate a realistic white horse standing on a plain light background.',
  outputDir: './output',
});

console.log(result.path);
```

What happens here:

- the SDK validates the selected model and image options
- it sends one image-generation request
- it saves the final image into `./output`
- it returns the saved file path

## Edit an Existing Image

```ts
import { editImage } from '@ank1015/llm-sdk';

const result = await editImage({
  provider: {
    model: 'gemini-3-pro-image-preview',
    apiKey: process.env.GEMINI_API_KEY!,
    imageOptions: {
      aspectRatio: '4:3',
      imageSize: '1K',
    },
  },
  prompt: 'Edit this image so the horse becomes brown but keep the pose and framing.',
  outputDir: './output',
  images: './white-horse.jpg',
});

console.log(result.path);
```

Important:

- `editImage()` always requires at least one input image
- `images` can be a single string or an array of strings
- each image string must be either a local file path or an `http(s)` URL

## Use More Than One Source Image

Both functions accept one or many source images:

```ts
await createImage({
  provider: {
    model: 'gpt-5.4',
    apiKey: process.env.OPENAI_API_KEY!,
  },
  prompt: 'Create a fantasy poster inspired by these references.',
  outputDir: './output',
  images: ['./reference-1.jpg', './reference-2.png', 'https://example.com/reference-3.webp'],
});
```

## Control the Saved Filename

By default, the SDK generates a filename stem for you.

If you want a predictable name, pass `outputName`:

```ts
await createImage({
  provider: {
    model: 'gpt-5.4',
    apiKey: process.env.OPENAI_API_KEY!,
  },
  prompt: 'Generate a white horse.',
  outputDir: './output',
  outputName: 'white-horse',
});
```

This saves something like:

```text
./output/white-horse.png
```

The final extension is chosen from the actual image mime type returned by the model.

## Receive Live Update Files

If the provider emits partial previews, thought images, or final update artifacts, you can receive them through `onUpdate`.

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

The callback receives saved local file paths, not raw base64.

## Use a Keys Adapter Instead of Passing `apiKey`

```ts
import { createImage } from '@ank1015/llm-sdk';
import { createFileKeysAdapter } from '@ank1015/llm-sdk-adapters';

const keysAdapter = createFileKeysAdapter();
await keysAdapter.set('openai', process.env.OPENAI_API_KEY!);

const result = await createImage({
  provider: {
    model: 'gpt-5.4',
  },
  prompt: 'Generate a white horse.',
  outputDir: './output',
  keysAdapter,
});
```

Credential precedence is:

1. `provider.apiKey`
2. `keysAdapter`

## Next

- [Models and Options](./models-and-options.md)
- [Inputs, Outputs, and Files](./inputs-outputs-and-files.md)
- [Updates and Adapters](./updates-and-adapters.md)
