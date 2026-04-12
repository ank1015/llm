# Google models

Use this file when the chosen model is `nano-banana` or `nano-banana-pro`.

## Best defaults

- Start with no settings.
- Add `aspectRatio` when composition matters.
- Add `imageSize` when resolution matters.
- Set `includeText: false` when you only need the image file and do not care about provider text.
- Add `googleSearch: true` only when the image needs current or factual grounding.

## Settings

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

## Practical guidance

### `aspectRatio`

Use it whenever layout matters.

Common choices:

- `1:1` for icons, stickers, avatars, square cards
- `16:9` for hero images, banners, thumbnails, slide art
- `9:16` for vertical posters or mobile-first visuals

### `imageSize`

Use:

- `1K` for most work
- `2K` when the asset matters more or needs more detail
- `4K` only when you explicitly need it

### `googleSearch`

Turn this on when the image needs grounded details such as:

- current weather
- recent events
- place-based specifics
- facts that should not be improvised

Do not turn it on by default for purely creative work.

### `includeText`

Set `includeText: false` when you only want image output.

Leave it unset when provider text might be useful for:

- prompt revisions
- captions
- creative notes
- grounded summaries alongside the image

## Prompting tips

- Lead with the outcome first: what the final image should be.
- Then specify composition, style, and important constraints.
- If using reference images, say what should be preserved and what should change.
- If readable text matters, explicitly say the exact words to render.
- For important work, prefer `nano-banana-pro` and write a more structured prompt.

## Good examples

Simple generation:

```ts
const result = await image({
  model: 'nano-banana',
  prompt: 'Create a bold travel sticker of a floating tea cart with the readable text SUN TEA.',
  output: './artifacts/tea-cart.png',
  settings: {
    aspectRatio: '1:1',
    imageSize: '1K',
  },
});
```

Reference-image edit:

```ts
const result = await image({
  model: 'nano-banana-pro',
  prompt:
    'Use this as a base and turn it into a premium emerald badge icon with soft highlights and no text.',
  imagePaths: ['./inputs/source.png'],
  output: './artifacts/badge.png',
  settings: {
    aspectRatio: '16:9',
    imageSize: '2K',
    includeText: false,
  },
});
```
