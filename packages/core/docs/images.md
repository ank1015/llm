# Image Runtime

`@ank1015/llm-core` exposes image generation separately from chat completion.

## Entry Points

- `generateImage()` - non-streaming image generation/editing runtime
- `getImageModel()` / `getImageModels()` / `getImageProviders()` - image model catalog helpers
- `calculateImageCost()` - derive normalized image cost from model pricing plus provider-reported usage
- `registerImageProvider()` - runtime extension point for custom image providers

## Built-In Image Providers

| Provider | Models                                                         | `getImageModel()` API key | Notes                                                 |
| -------- | -------------------------------------------------------------- | ------------------------- | ----------------------------------------------------- |
| OpenAI   | `gpt-image-1.5`                                                | `openai`                  | Uses the OpenAI Images API for generate/edit flows    |
| Google   | `gemini-3.1-flash-image-preview`, `gemini-3-pro-image-preview` | `google`                  | Uses Gemini `generateContent()` with image modalities |

## Common Result Shape

`generateImage()` returns:

- `content` - normalized `Content` blocks in provider order
- `images` - convenience array of generated `image` blocks
- `usage` - normalized token accounting with text/image splits and computed `usage.cost`
- `response` - provider-native response preserved for advanced access

Google image responses may include both text and image blocks in `content`. OpenAI image responses currently normalize to image blocks only.

## Context Shape

The shared image context is:

```ts
{
  prompt: string;
  images?: ImageContent[];
  mask?: ImageContent;
}
```

- `prompt` is required for both providers
- `images` enables edit/reference-image flows
- `mask` is currently supported for OpenAI image edits

## Notes

- The image runtime is intentionally non-streaming for now.
- OpenAI uses the dedicated Images API instead of the Responses API.
- Google always forces `IMAGE` output in the underlying `responseModalities` config.
- Usage comes from the provider-native response payload.
- Cost is computed locally from the image model catalog pricing via `calculateImageCost()`.
