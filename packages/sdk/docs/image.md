# `image()`

Simple image generation and editing with saved output files.

```ts
import { image } from '@ank1015/llm-sdk';
```

## Basic Usage

```ts
const result = await image({
  prompt: 'Create a polished travel sticker of a floating tea cart.',
  output: './artifacts/tea-cart.png',
});

console.log(result.path);
console.log(result.paths);
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

### Required Fields

- `prompt`: the instruction for the image.
- `output`: the base file path where generated image files should be saved.

### Editing Fields

- `inputImages`: local image paths to use as references or edit sources.
- `mask`: local mask image path for a localized edit. A mask requires at least one `inputImages` entry and applies to the first input image.

Mask files should match the source image format and size. Use a PNG mask with an alpha channel when possible.

### Output Options

- `count`: how many images to create.
- `size`: `auto` or a resolution like `1024x1024`, `1536x1024`, or `1024x1536`.
- `quality`: use `low` for drafts, `medium` for normal work, and `high` for final assets.
- `format`: saved image format, usually `png`, `jpeg`, or `webp`.
- `compression`: integer from 0 to 100. Only use it with `jpeg` or `webp`.
- `background`: `auto` or `opaque`.
- `moderation`: `auto` for normal filtering or `low` when a less restrictive setting is appropriate.

Leave optional fields out unless the task needs them.

## Return Value

```ts
interface ImageResult {
  path?: string;
  paths: string[];
  text: string;
  usage: ImageUsage;
  raw: AnyImageResult;
}
```

- `paths` always contains every saved output path.
- `path` is present when exactly one image was generated.
- `text` is present when the image request returns text.
- `usage` contains normalized usage and cost.
- `raw` contains the full normalized runtime result for advanced inspection.

The extension in `output` is a base-name hint. The final extension follows the generated image format.

## Examples

### Text To Image

```ts
const result = await image({
  prompt: 'Create a bold sticker of a cobalt kite. No text.',
  output: './artifacts/kite.png',
  size: '1024x1024',
  quality: 'low',
  format: 'png',
});
```

### Reference Image Edit

```ts
const result = await image({
  prompt: 'Use this as a base and turn it into a premium emerald badge icon.',
  inputImages: ['./inputs/badge-source.png'],
  output: './artifacts/badge.png',
  size: '1024x1024',
  quality: 'high',
});
```

### Masked Edit

```ts
const result = await image({
  prompt: 'Replace the center area with a green approval badge and keep everything else unchanged.',
  inputImages: ['./inputs/source.png'],
  mask: './inputs/mask.png',
  output: './artifacts/approval.png',
  quality: 'high',
});
```

### Multiple Drafts

```ts
const result = await image({
  prompt: 'Create three rough logo directions for a quiet productivity app.',
  output: './artifacts/logo.png',
  count: 3,
  quality: 'low',
});

console.log(result.paths);
```
