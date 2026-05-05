---
name: image-gen
description: Use when you want to create or edit images with `image()` from `@ank1015/llm-sdk`.
---

# Image Gen

Use this skill when working with image generation or image editing in Node.js.

## Start Here

```ts
import { image } from '@ank1015/llm-sdk';

const result = await image({
  prompt: 'Create a polished travel sticker of a floating tea cart.',
  output: './artifacts/tea-cart.png',
});

console.log(result.paths);
```

## What To Pass

- `prompt`: describe exactly what to create or change.
- `output`: where to save the generated image file.
- `inputImages`: local image paths to use as references or edit sources.
- `mask`: local mask path for a localized edit. Use it with `inputImages`.

## Useful Options

- `count`: create multiple options in one call.
- `size`: use `1024x1024` for square, `1536x1024` for landscape, `1024x1536` for portrait, or `auto`.
- `quality`: use `low` for drafts, `medium` for normal work, and `high` for final assets.
- `format`: use `png`, `jpeg`, or `webp`.
- `compression`: integer from 0 to 100. Use only with `jpeg` or `webp`.
- `background`: use `auto` or `opaque`.
- `moderation`: use `auto` unless the task needs `low`.

Leave options out when they do not matter.

## Common Patterns

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

Reference image edit:

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

## Result

- `result.paths` always contains every saved image path.
- `result.path` exists when exactly one image was generated.
- The extension in `output` is a base-name hint. The saved file extension follows the generated image format.

## Details

- For localized edits, the mask should match the first input image size and format.
- Use a PNG mask with an alpha channel when possible.
- Need the exact type shape: read [references/api.md](./references/api.md)
