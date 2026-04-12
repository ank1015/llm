---
name: image-gen
description: Use when you want to create or edit images with `image()` from `@ank1015/llm-sdk`. Covers model choice across `nano-banana`, `nano-banana-pro`, and `gpt-image`, path-first output handling, central-keystore-first key selection, and provider-specific settings guidance.
---

# Image Gen

Use this skill when working with image generation or image editing. This skill uses `@ank1015/llm-sdk` and only works in node runtimes.

## Choose The Model

- Prefer `nano-banana` for most image creation and editing work.
- Prefer `nano-banana-pro` for higher-stakes deliverables, more complex prompts, polished text-heavy visuals, and premium marketing or editorial assets.
- Use `gpt-image` when the user explicitly wants OpenAI or when you need OpenAI-specific controls such as masks, multiple outputs in one call, transparent backgrounds, or output format and compression control.
- If both Google and OpenAI can do the job, prefer the Google models.

Read [references/recommandation.md](./references/recommandation.md) for the full model-selection workflow and default preference order.

## Follow These Defaults

- Import `image` from `@ank1015/llm-sdk`.
- Check the central keystore first with `getAvailableKeyProviders()` from `@ank1015/llm-sdk/keys`.
- If `google` or `openai` is already available centrally, omit `keysFilePath` and let the SDK use the default keys file.
- Always pass an `output` base path and read `result.paths` after the call finishes.
- Use `imagePaths` for reference-image and edit flows.
- Use `maskPath` only with `gpt-image`.
- Start with no settings or only one or two settings. Add more controls only when the task clearly needs them.
- Use literal model aliases so TypeScript can infer the correct settings type.

## Remember The Main Behavior

- `image()` is path-first. It saves generated images to disk for you.
- `result.paths` always contains the saved output paths.
- `result.path` is only present when exactly one image was generated.
- The extension in `output` is only a base-name hint. The final extension follows the provider's returned image format.
- `result.text` may contain provider text, especially with Google models.

## Start With This Pattern

```ts
import { image } from '@ank1015/llm-sdk';
import { getAvailableKeyProviders } from '@ank1015/llm-sdk/keys';

const availableProviders = await getAvailableKeyProviders();

const model = availableProviders.includes('google') ? 'nano-banana' : 'gpt-image';

const result = await image({
  model,
  prompt: 'Create a polished travel sticker of a floating tea cart.',
  output: './artifacts/tea-cart.png',
});

console.log(result.paths);
```

## Read The Right Reference File

- Need the exact `image()` input, output, or saved-path behavior: read [references/api.md](./references/api.md)
- Need the recommended model choice and default workflow: read [references/recommandation.md](./references/recommandation.md)
- Need Google settings and prompting guidance: read [references/google.md](./references/google.md)
- Need OpenAI settings and prompting guidance: read [references/openai.md](./references/openai.md)
