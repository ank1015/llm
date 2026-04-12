# OpenAI model

Use this file when the chosen model is `gpt-image`.

## Best defaults

- Start with only `size` and `quality` when needed.
- Use `background: 'transparent'` for icons, product cutouts, and asset work.
- Use `count` when you want multiple alternatives in one call.
- Use `maskPath` for localized edits.
- Use `fidelity: 'high'` when editing and you want the input image preserved more closely.

## Settings

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

## Practical guidance

### `background`

Use:

- `transparent` for icons, stickers, overlays, UI assets, cutouts
- leave it unset for most normal images

### `count`

Use it when the user wants several options at once.

Remember:

- `result.path` will usually be absent
- read `result.paths`

### `format` and `compression`

Use them when file output matters.

Common pattern:

- `format: 'webp'` with `compression` for smaller assets
- `format: 'png'` when lossless output is more important

### `fidelity`

Best used for edit flows with `imagePaths`.

Use:

- `high` when the input image should stay closer to the original
- omit it for normal generations

### `maskPath`

Use `maskPath` only for localized edits.

Pattern:

```ts
const result = await image({
  model: 'gpt-image',
  prompt: 'Transform this into a green approval badge with a centered white checkmark.',
  imagePaths: ['./inputs/source.png'],
  maskPath: './inputs/mask.png',
  output: './artifacts/approval.png',
  settings: {
    background: 'transparent',
    fidelity: 'high',
    size: '1024x1024',
  },
});
```

## Prompting tips

- Describe the final image clearly before listing controls.
- For edits, explicitly say what must stay unchanged.
- For mask edits, describe only the masked transformation and preserve the rest.
- Ask for clean backgrounds and no text when you truly want that.
- Use `count` for option sets instead of asking for many unrelated variations inside one prompt.

## Good examples

Transparent product asset:

```ts
const result = await image({
  model: 'gpt-image',
  prompt: 'Create two clean product icons on a transparent background. No text.',
  output: './artifacts/icons.png',
  settings: {
    background: 'transparent',
    count: 2,
    format: 'webp',
    compression: 60,
    size: '1024x1024',
  },
});
```

Masked edit:

```ts
const result = await image({
  model: 'gpt-image',
  prompt: 'Replace the center area with a green approval badge and keep everything else unchanged.',
  imagePaths: ['./inputs/source.png'],
  maskPath: './inputs/mask.png',
  output: './artifacts/approval.png',
  settings: {
    background: 'transparent',
    fidelity: 'high',
    quality: 'high',
  },
});
```
