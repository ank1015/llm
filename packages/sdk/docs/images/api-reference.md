# API Reference

## Import

```ts
import { createImage, editImage } from '@ank1015/llm-sdk';
```

Optional Node adapters:

```ts
import { createFileKeysAdapter, createSqliteUsageAdapter } from '@ank1015/llm-sdk-adapters';
```

## Types

### `ImageModelId`

```ts
'gpt-5.4' | 'gemini-3.1-flash-image-preview' | 'gemini-3-pro-image-preview';
```

### `ImageSource`

```ts
string | readonly string[]
```

Each string must be:

- a local image file path
- or a public `http(s)` image URL

### `ImageProvider`

```ts
type ImageProvider =
  | {
      model: 'gpt-5.4';
      apiKey?: string;
      imageOptions?: {
        format?: 'png' | 'jpeg' | 'webp';
        quality?: 'low' | 'medium' | 'high' | 'auto';
        background?: 'transparent' | 'opaque' | 'auto';
        size?: '1024x1024' | '1024x1536' | '1536x1024' | 'auto';
        partialImages?: 0 | 1 | 2 | 3;
        inputFidelity?: 'low' | 'high';
        moderation?: 'auto' | 'low';
      };
    }
  | {
      model: 'gemini-3.1-flash-image-preview';
      apiKey?: string;
      imageOptions?: {
        aspectRatio?:
          | '1:1'
          | '1:4'
          | '1:8'
          | '2:3'
          | '3:2'
          | '3:4'
          | '4:1'
          | '4:3'
          | '4:5'
          | '5:4'
          | '8:1'
          | '9:16'
          | '16:9'
          | '21:9';
        imageSize?: '1K' | '2K' | '4K';
      };
    }
  | {
      model: 'gemini-3-pro-image-preview';
      apiKey?: string;
      imageOptions?: {
        aspectRatio?:
          | '1:1'
          | '2:3'
          | '3:2'
          | '3:4'
          | '4:3'
          | '4:5'
          | '5:4'
          | '9:16'
          | '16:9'
          | '21:9';
        imageSize?: '1K' | '2K' | '4K';
      };
    };
```

### `ImageUpdate`

```ts
{
  stage: 'partial' | 'thought' | 'final';
  path: string;
  mimeType: string;
  index: number;
  model: ImageModelId;
}
```

### `ImageResult`

```ts
{
  path: string;
}
```

## `createImage()`

```ts
createImage(input: CreateImageRequest): Promise<ImageResult>
```

### `CreateImageRequest`

```ts
{
  provider: ImageProvider;
  prompt: string;
  outputDir: string;
  outputName?: string;
  keysAdapter?: KeysAdapter;
  usageAdapter?: UsageAdapter;
  systemPrompt?: string;
  onUpdate?: (update: ImageUpdate) => void | Promise<void>;
  images?: ImageSource;
}
```

Use this for new image generation.

## `editImage()`

```ts
editImage(input: EditImageRequest): Promise<ImageResult>
```

### `EditImageRequest`

```ts
{
  provider: ImageProvider;
  prompt: string;
  outputDir: string;
  outputName?: string;
  keysAdapter?: KeysAdapter;
  usageAdapter?: UsageAdapter;
  systemPrompt?: string;
  onUpdate?: (update: ImageUpdate) => void | Promise<void>;
  images: ImageSource;
}
```

Use this for editing existing images.

`images` is required.

## Behavior Notes

- `provider` is required
- `provider.model` must be one of the 3 supported image model IDs
- `outputDir` is required
- `outputName` is optional
- only the first final image is kept as the main result
- unsupported provider option combinations throw immediately
- update callbacks receive saved file paths, not raw base64 data

## Common Errors

### Unsupported model

Cause:

- `provider.model` is not one of the 3 supported image model IDs

### Missing input image for `editImage()`

Cause:

- `editImage()` was called without any source images

### Unsupported provider options

Cause:

- a provider image option was used with the wrong provider or wrong method

### Unsupported image input

Cause:

- a local file or downloaded URL could not be identified as a supported image type
