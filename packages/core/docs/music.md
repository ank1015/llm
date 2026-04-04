# Music Runtime

`@ank1015/llm-core` exposes music generation separately from chat completion, image generation, and video generation.

## Entry Points

- `generateMusic()` - non-streaming music generation runtime
- `getMusicModel()` / `getMusicModels()` / `getMusicProviders()` - music model catalog helpers
- `calculateMusicCost()` - per-request music pricing helper derived from the built-in model catalog
- `registerMusicProvider()` - runtime extension point for custom music providers

## Built-In Music Providers

| Provider | Models | `getMusicModel()` API key | Notes |
| -------- | ------ | ------------------------- | ----- |
| Google   | `lyria-3-clip-preview`, `lyria-3-pro-preview` | `google` | Uses Gemini `generateContent()` with `AUDIO` output enforced |

## Common Result Shape

`generateMusic()` returns:

- `response` - provider-native final response preserved for advanced access
- `content` - normalized text and audio blocks in provider order
- `tracks` - normalized generated audio tracks
- `usage` - normalized token accounting by text, image, and audio modalities, plus per-request `usage.cost`

Each normalized track has the shape:

```ts
{
  type: 'audio';
  data: string;
  mimeType: string;
  metadata?: Record<string, unknown>;
}
```

Google Lyria may return text blocks containing lyrics or structure guidance alongside the audio track.

## Context Shape

The shared music context is:

```ts
{
  prompt: string;
  images?: ImageContent[];
}
```

- `prompt` is required
- both built-in Lyria models accept text and image inputs
- Google Lyria supports up to 10 input images in this runtime

## Notes

- The music runtime is intentionally non-streaming for now.
- Google Lyria uses `generateContent()`, so there is no operation polling loop like Veo.
- `responseModalities` are normalized to always include `AUDIO`.
- Google Lyria pricing is modeled per successful request, so `usage.cost` is derived from the built-in model catalog instead of token counts.
- `lyria-3-clip-preview` is fixed to 30-second MP3 output.
- `lyria-3-pro-preview` supports prompt-shaped longer compositions and can return MP3 or WAV output.
