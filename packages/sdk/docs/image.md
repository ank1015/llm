# `image()`

The function for simple path-first image generation and editing.

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

console.log(result.path); // saved file path
console.log(result.paths); // always an array
console.log(result.text); // provider text, if any
```

`image()` resolves provider credentials from the SDK keys file, calls the core image runtime, saves the generated image files to disk, and returns the saved paths plus the normalized core result.

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

Pick one of the SDK image aliases:

| SDK model         | Core model                       | Provider |
| ----------------- | -------------------------------- | -------- |
| `nano-banana`     | `gemini-3.1-flash-image-preview` | `google` |
| `nano-banana-pro` | `gemini-3-pro-image-preview`     | `google` |
| `gpt-image`       | `gpt-image-1.5`                  | `openai` |

These aliases are intentionally shorter than the core model IDs.

### `prompt`

The text instruction for the generation or edit.

```ts
prompt: 'Turn this flat logo into a glossy enamel pin on white.';
```

### `output`

The base output file path to save generated images to.

Rules:

- If one image is generated, the SDK saves it to the same base name with the actual returned extension.
- If multiple images are generated, the SDK saves suffixed files like `poster-1.png`, `poster-2.jpg`.
- The extension in `output` is treated as a hint for the base name, not a guarantee of the final extension.

Examples:

```ts
output: './artifacts/poster.png'; // may save as poster.webp if the provider returns webp
output: './artifacts/icons'; // may save as icons-1.png, icons-2.jpg
```

### `imagePaths`

Optional local source images for image-to-image or reference-image flows.

```ts
imagePaths: ['./inputs/source.png'];
```

The SDK reads these files from disk, converts them to base64, and passes them to the core image runtime.

### `maskPath`

OpenAI-only mask input for edit flows.

```ts
maskPath: './inputs/mask.png';
```

Notes:

- `maskPath` is only supported with `model: 'gpt-image'`
- a mask requires at least one `imagePaths` entry

### `keysFilePath`

By default the SDK reads credentials from `~/.llm-sdk/keys.env`. Pass a custom path here to override it.

### `requestId`

Optional request id forwarded to the core image runtime.

### `signal`

Abort signal for cancelling the generation request.

---

## Settings

The SDK keeps settings small and model-specific instead of exposing the full raw provider option bag.

### `NanoBananaSettings`

```ts
type NanoBananaSettings = {
  aspectRatio?: string;
  imageSize?: string;
  personGeneration?: string;
  prominentPeople?: string;
  googleSearch?: boolean;
  includeText?: boolean;
};
```

Common examples:

```ts
settings: {
  aspectRatio: '16:9',
  imageSize: '2K',
  googleSearch: true,
  includeText: false,
}
```

Notes:

- `googleSearch: true` enables Google Search grounding in the underlying Gemini request.
- `includeText: false` requests image-only output from the SDK surface. By default the SDK asks Gemini for both `TEXT` and `IMAGE`.

### `GptImageSettings`

```ts
type GptImageSettings = {
  size?: string;
  quality?: string;
  background?: string;
  format?: string;
  compression?: number;
  moderation?: string;
  count?: number;
  fidelity?: string;
};
```

Common examples:

```ts
settings: {
  size: '1024x1024',
  quality: 'high',
  background: 'transparent',
  format: 'webp',
  compression: 60,
  count: 2,
}
```

Notes:

- `count` requests multiple images in one call.
- `fidelity` maps to OpenAI image edit fidelity and is mainly useful for edit flows with input images.

---

## Return value

```ts
interface ImageResult {
  model: ImageModelId;
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

Any text blocks returned by the provider.

This is especially useful for Gemini image flows, which may return mixed text plus image output.

### `usage`

Normalized usage from the core image runtime.

### `result`

The full normalized core result, including:

- `content`
- `images`
- `usage`
- `response` (native provider response)

---

## Examples

### Text-to-image with `nano-banana`

```ts
const result = await image({
  model: 'nano-banana',
  prompt: 'Create a bold sticker of a cobalt kite and add the readable text SKY DAY.',
  output: './artifacts/kite.png',
  settings: {
    aspectRatio: '1:1',
    imageSize: '1K',
  },
});

console.log(result.path);
```

### Reference-image editing with `nano-banana-pro`

```ts
const result = await image({
  model: 'nano-banana-pro',
  prompt: 'Use this as a base and turn it into a premium emerald badge icon.',
  imagePaths: ['./inputs/badge-source.png'],
  output: './artifacts/badge.png',
  settings: {
    aspectRatio: '16:9',
    imageSize: '2K',
    includeText: false,
  },
});
```

### Masked edit with `gpt-image`

```ts
const result = await image({
  model: 'gpt-image',
  prompt: 'Transform this into a clean green approval badge with a centered white checkmark.',
  imagePaths: ['./inputs/source.png'],
  maskPath: './inputs/mask.png',
  output: './artifacts/approval.png',
  settings: {
    background: 'transparent',
    fidelity: 'high',
    quality: 'high',
    size: '1024x1024',
  },
});

console.log(result.path);
```

### Multiple outputs with `gpt-image`

```ts
const result = await image({
  model: 'gpt-image',
  prompt: 'Create two simple product icons on a transparent background.',
  output: './artifacts/icons.png',
  settings: {
    count: 2,
    format: 'webp',
  },
});

console.log(result.paths);
```

---

## Errors

Setup failures reject with `ImageInputError`, for example:

- unsupported SDK image alias
- missing provider credentials
- missing core image model registration

Regular runtime failures, such as a missing local input file or a provider-side rejection, are thrown as normal errors.
