# Video Runtime

`@ank1015/llm-core` exposes video generation separately from chat completion and image generation.

## Entry Points

- `generateVideo()` - non-streaming video generation runtime
- `getVideoModel()` / `getVideoModels()` / `getVideoProviders()` - video model catalog helpers
- `calculateVideoCost()` - per-second video pricing helper derived from the built-in model catalog
- `registerVideoProvider()` - runtime extension point for custom video providers

## Built-In Video Providers

| Provider | Models                                                                                       | `getVideoModel()` API key | Notes                                                                               |
| -------- | -------------------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------- |
| Google   | `veo-3.1-generate-preview`, `veo-3.1-fast-generate-preview`, `veo-3.1-lite-generate-preview` | `google`                  | Uses Gemini `generateVideos()` and waits for the long-running operation to complete |

## Common Result Shape

`generateVideo()` returns:

- `operation` - provider-native long-running operation preserved for advanced access
- `response` - provider-native final response preserved for advanced access
- `videos` - normalized generated video assets
- `usage` - normalized usage metadata, including estimated pricing when built-in model rates are available

Google Veo currently returns video file handles but does not expose provider-native usage metadata in the response payload. Core therefore marks `usage.source` as `estimated` and computes `usage.cost` from the built-in per-second model pricing plus the resolved request settings.

Each normalized video asset has the shape:

```ts
{
  type: 'video';
  data?: string;
  mimeType?: string;
  uri?: string;
  metadata?: Record<string, unknown>;
}
```

Google Veo responses may contain a provider `uri`, inline `data`, or both, depending on the native response.

## Context Shape

The shared video context is:

```ts
{
  prompt?: string;
  image?: ImageContent;
  lastFrame?: ImageContent;
  referenceImages?: {
    image: ImageContent;
    referenceType?: 'asset' | 'style';
  }[];
  video?: VideoAsset;
}
```

- At least one of `prompt`, `image`, or `video` is required
- `image` enables image-to-video and first-frame interpolation flows
- `lastFrame` is only valid when `image` is provided
- `referenceImages` supports up to 3 images and is a separate mode from image/video/last-frame inputs
- `video` is used for Veo extension flows

## Notes

- The video runtime is intentionally non-streaming for now.
- Google video generation is operation-based, so `generateVideo()` polls until completion.
- Google Veo pricing is modeled as per-second spend by resolution, so `usage.cost` is estimated locally rather than read from the provider response.
- Provider polling can be tuned with `pollIntervalMs` and `timeoutMs`.
- `signal` cancels client-side polling and requests, but does not stop an already-started provider job.
