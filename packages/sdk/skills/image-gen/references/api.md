# `image()`

The function for image generation and editing with saved output files.

```ts
import { image } from '@ank1015/llm-sdk';
```

## Input

```ts
type ImageInput = {
  prompt: string;
  output: string;
  inputImages?: string[];
  mask?: string;
  count?: number;
  size?: 'auto' | `${number}x${number}`;
  quality?: 'auto' | 'low' | 'medium' | 'high';
  format?: 'png' | 'jpeg' | 'webp';
  compression?: number;
  background?: 'auto' | 'opaque';
  moderation?: 'auto' | 'low';
  requestId?: string;
  signal?: AbortSignal;
};
```

## Output

```ts
type ImageResult = {
  path?: string;
  paths: string[];
  text: string;
  usage: ImageUsage;
  raw: unknown;
};
```

- `paths` always contains every saved output path.
- `path` is only present when exactly one image was generated.
- The saved file extension follows the generated image format.

## Examples

Text to image:

```ts
const result = await image({
  prompt: 'Create a bold sticker of a cobalt kite. No text.',
  output: './artifacts/kite.png',
  size: '1024x1024',
  quality: 'low',
  format: 'png',
});
```

Reference edit:

```ts
const result = await image({
  prompt: 'Use this as a base and turn it into a premium emerald badge icon.',
  inputImages: ['./inputs/source.png'],
  output: './artifacts/badge.png',
  quality: 'high',
});
```

Masked edit:

```ts
const result = await image({
  prompt: 'Replace the center area with a green approval badge and keep everything else unchanged.',
  inputImages: ['./inputs/source.png'],
  mask: './inputs/mask.png',
  output: './artifacts/approval.png',
  quality: 'high',
});
```

Multiple drafts:

```ts
const result = await image({
  prompt: 'Create three rough logo directions for a quiet productivity app.',
  output: './artifacts/logo.png',
  count: 3,
  quality: 'low',
});
```
