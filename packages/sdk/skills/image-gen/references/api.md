# `image()`

The function for simple image generation and editing with saved output files.

```ts
import { image } from '@ank1015/llm-sdk';
```

---

## Basic usage

```ts
const result = await image({
  model: 'nano-banana',
  prompt: 'Create a polished travel sticker of a floating tea cart.',
  output: './artifacts/tea-cart.png',
});

console.log(result.path);
console.log(result.paths);
console.log(result.text);
```

`image()` resolves credentials, reads any local input images, saves generated images to disk, and returns the saved paths plus the normalized result.

---

## Input

```ts
type ImageInput =
  | {
      model: 'nano-banana' | 'nano-banana-pro';
      prompt: string;
      output: string;
      imagePaths?: string[];
      settings?: NanoBananaSettings;
      keysFilePath?: string;
      requestId?: string;
      signal?: AbortSignal;
    }
  | {
      model: 'gpt-image';
      prompt: string;
      output: string;
      imagePaths?: string[];
      maskPath?: string;
      settings?: GptImageSettings;
      keysFilePath?: string;
      requestId?: string;
      signal?: AbortSignal;
    };
```

### `model`

Pick one of these SDK aliases:

- `nano-banana`
- `nano-banana-pro`
- `gpt-image`

### `prompt`

The text instruction for the generation or edit.

### `output`

The base output file path.

Rules:

- If one image is generated, the SDK saves it to the same base name with the actual returned extension.
- If multiple images are generated, the SDK saves suffixed files like `poster-1.png`, `poster-2.jpg`.
- The extension in `output` is treated as a base-name hint, not a guaranteed final extension.

Examples:

```ts
output: './artifacts/poster.png';
output: './artifacts/icons';
```

### `imagePaths`

Optional local source images for reference-image and edit flows.

```ts
imagePaths: ['./inputs/source.png'];
```

### `maskPath`

OpenAI-only mask input for localized edits.

```ts
maskPath: './inputs/mask.png';
```

Notes:

- `maskPath` only works with `gpt-image`
- a mask requires at least one `imagePaths` entry

### `keysFilePath`

Optional custom keys file path. If omitted, the SDK uses the default central keystore.

### `requestId`

Optional request id forwarded to the runtime.

### `signal`

Abort signal for cancelling the request.

---

## Return value

```ts
interface ImageResult {
  model: 'nano-banana' | 'nano-banana-pro' | 'gpt-image';
  api: 'google' | 'openai';
  providerModelId: string;
  path?: string;
  paths: string[];
  text: string;
  usage: ImageUsage;
  result: BaseImageResult;
}
```

### `path` and `paths`

- `paths` always contains every saved output path.
- `path` is only present when exactly one image was generated.

### `text`

Provider text output, if any.

### `usage`

Normalized usage and cost.

### `result`

The full normalized result for advanced access.

---

## Good default pattern

```ts
const result = await image({
  model: 'nano-banana',
  prompt: 'Create a cinematic badge icon with soft highlights.',
  imagePaths: ['./inputs/source.png'],
  output: './artifacts/badge.png',
});
```
