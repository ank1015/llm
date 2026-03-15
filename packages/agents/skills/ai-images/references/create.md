# Create Images

Use this reference when the user wants to generate a brand-new image or create a new image while
optionally conditioning on reference images.

If you are not sure which model to use, read [choose-model.md](choose-model.md) first.

## Import

```ts
import { createImage } from '@ank1015/llm-agents';
```

## Request Shape

```ts
await createImage({
  provider: {
    model: 'gpt-5.4',
  },
  prompt: 'A cinematic product photo of a matte black camera on a warm stone pedestal',
  outputDir: '/absolute/output/dir',
  outputName: 'camera-hero',
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
- `outputDir`
  - required absolute or relative directory for the final image
- `outputName`
  - optional filename stem only, not a path
- `images`
  - optional reference image paths or URLs
  - useful when the model should create from existing visual context
- `systemPrompt`
  - optional additional instruction layer
- `onUpdate`
  - optional callback for partial, thought, and final image events

## OpenAI Options

For `gpt-5.4`, `provider.imageOptions` can include:

- `format`: `png | jpeg | webp`
- `quality`: `low | medium | high | auto`
- `background`: `transparent | opaque | auto`
- `size`: `1024x1024 | 1024x1536 | 1536x1024 | auto`
- `partialImages`: `0 | 1 | 2 | 3`
- `moderation`: `auto | low`

Do not use `inputFidelity` with `createImage()`.

## Google Options

For Google image models, `provider.imageOptions` can include:

- `imageSize`: `1K | 2K | 4K`
- `aspectRatio`

Flash model aspect ratios:

- `1:1`, `1:4`, `1:8`, `2:3`, `3:2`, `3:4`, `4:1`, `4:3`, `4:5`, `5:4`, `8:1`, `9:16`, `16:9`, `21:9`

Pro model aspect ratios:

- `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9`

## Output Behavior

- The final image is written to `outputDir/outputName.<ext>`.
- Intermediate outputs are written to `outputDir/outputName__updates/`.
- The returned value is:

```ts
{
  path: '/final/image/path.png';
}
```

## Example With Progress Updates

```ts
import { createImage } from '@ank1015/llm-agents';

const result = await createImage({
  provider: {
    model: 'gemini-3-pro-image-preview',
    imageOptions: {
      aspectRatio: '16:9',
      imageSize: '2K',
    },
  },
  prompt: 'A dramatic sunrise over a foggy mountain village, painterly but realistic',
  outputDir: '/absolute/output/dir',
  outputName: 'mountain-village',
  onUpdate(update) {
    console.log(update.stage, update.path);
  },
});

console.log(result.path);
```
