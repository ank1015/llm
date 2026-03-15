# Edit Images

Use this reference when the user wants to modify, transform, or extend one or more existing
images.

## Import

```ts
import { editImage } from '@ank1015/llm-agents';
```

## Request Shape

```ts
await editImage({
  provider: {
    model: 'gpt-5.4',
  },
  prompt: 'Turn this product photo into a premium studio ad with soft rim light',
  images: ['/absolute/path/to/input.png'],
  outputDir: '/absolute/output/dir',
  outputName: 'product-ad',
});
```

## Fields

- `provider.model`
  - required
  - one of `gpt-5.4`, `gemini-3.1-flash-image-preview`, `gemini-3-pro-image-preview`
- `provider.imageOptions`
  - optional model-specific controls
- `prompt`
  - required
- `images`
  - required
  - one path/URL or an array of paths/URLs
- `outputDir`
  - required
- `outputName`
  - optional filename stem only
- `systemPrompt`
  - optional
- `onUpdate`
  - optional callback for progress artifacts

## Supported Inputs

The helper accepts:

- local image paths
- remote `http` / `https` image URLs

The helper infers image type from content type, file bytes, or file extension.

## OpenAI Options

For `gpt-5.4`, `provider.imageOptions` can include:

- `format`: `png | jpeg | webp`
- `quality`: `low | medium | high | auto`
- `background`: `transparent | opaque | auto`
- `size`: `1024x1024 | 1024x1536 | 1536x1024 | auto`
- `partialImages`: `0 | 1 | 2 | 3`
- `inputFidelity`: `low | high`
- `moderation`: `auto | low`

`inputFidelity` is valid here and is specific to edit flows.

## Google Options

For Google image models, `provider.imageOptions` can include:

- `imageSize`: `1K | 2K | 4K`
- `aspectRatio`

Use the same aspect-ratio families described in the create flow, depending on whether the model is
Flash or Pro.

## Output Behavior

- The final edited image is written to `outputDir/outputName.<ext>`.
- Intermediate outputs are written to `outputDir/outputName__updates/`.
- The helper throws if no final image is returned by the provider.

## Example

```ts
import { editImage } from '@ank1015/llm-agents';

const result = await editImage({
  provider: {
    model: 'gpt-5.4',
    imageOptions: {
      inputFidelity: 'high',
      quality: 'high',
      format: 'png',
    },
  },
  prompt: 'Replace the background with a clean beige studio wall and add a subtle floor shadow',
  images: ['https://example.com/reference/product.png'],
  outputDir: '/absolute/output/dir',
  outputName: 'product-edit',
});

console.log(result.path);
```
