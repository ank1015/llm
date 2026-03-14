# Models and Options

This guide explains the supported image models and the provider-specific options you can pass to them.

## Supported Models

The SDK image API supports exactly 3 models:

| Model ID                         | Provider API | Typical use                                           |
| -------------------------------- | ------------ | ----------------------------------------------------- |
| `gpt-5.4`                        | `openai`     | OpenAI image generation and editing                   |
| `gemini-3.1-flash-image-preview` | `google`     | Faster Gemini image generation and editing            |
| `gemini-3-pro-image-preview`     | `google`     | Higher-capability Gemini image generation and editing |

You now pass model selection inside a `provider` object:

```ts
provider: {
  model: "gpt-5.4",
}
```

or:

```ts
provider: {
  model: "gemini-3-pro-image-preview",
}
```

This shape gives you provider-specific type safety:

- OpenAI providers only accept OpenAI image options
- Google providers only accept Google image options
- the allowed Gemini aspect ratios depend on the selected Gemini model

## OpenAI Provider Shape

```ts
provider: {
  model: "gpt-5.4";
  apiKey?: string;
  imageOptions?: {
    format?: "png" | "jpeg" | "webp";
    quality?: "low" | "medium" | "high" | "auto";
    background?: "transparent" | "opaque" | "auto";
    size?: "1024x1024" | "1024x1536" | "1536x1024" | "auto";
    partialImages?: 0 | 1 | 2 | 3;
    inputFidelity?: "low" | "high";
    moderation?: "auto" | "low";
  };
}
```

### Notes

- `inputFidelity` is only valid with `editImage()`
- `size` is a fixed OpenAI set, not an arbitrary string
- `partialImages` controls how many partial preview images OpenAI may stream back

### OpenAI Example

```ts
await createImage({
  provider: {
    model: 'gpt-5.4',
    apiKey: process.env.OPENAI_API_KEY!,
    imageOptions: {
      format: 'png',
      quality: 'high',
      size: '1024x1024',
      background: 'opaque',
      partialImages: 2,
    },
  },
  prompt: 'Generate a clean product-style icon of a white horse.',
  outputDir: './output',
});
```

## Google Provider Shape

### `gemini-3.1-flash-image-preview`

```ts
provider: {
  model: "gemini-3.1-flash-image-preview";
  apiKey?: string;
  imageOptions?: {
    aspectRatio?:
      | "1:1"
      | "1:4"
      | "1:8"
      | "2:3"
      | "3:2"
      | "3:4"
      | "4:1"
      | "4:3"
      | "4:5"
      | "5:4"
      | "8:1"
      | "9:16"
      | "16:9"
      | "21:9";
    imageSize?: "1K" | "2K" | "4K";
  };
}
```

### `gemini-3-pro-image-preview`

```ts
provider: {
  model: "gemini-3-pro-image-preview";
  apiKey?: string;
  imageOptions?: {
    aspectRatio?:
      | "1:1"
      | "2:3"
      | "3:2"
      | "3:4"
      | "4:3"
      | "4:5"
      | "5:4"
      | "9:16"
      | "16:9"
      | "21:9";
    imageSize?: "1K" | "2K" | "4K";
  };
}
```

### Notes

- `aspectRatio` is curated and model-specific
- `imageSize` is a fixed Google set: `1K`, `2K`, `4K`
- OpenAI-only options like `format`, `size`, and `partialImages` are not valid for Google

### Google Example

```ts
await createImage({
  provider: {
    model: 'gemini-3.1-flash-image-preview',
    apiKey: process.env.GEMINI_API_KEY!,
    imageOptions: {
      aspectRatio: '16:9',
      imageSize: '2K',
    },
  },
  prompt: 'Generate a white horse in a studio.',
  outputDir: './output',
});
```

## Invalid Combinations Fail Fast

The SDK throws before sending a request if the provider and options do not match.

Examples:

- `provider.imageOptions.aspectRatio` on OpenAI
- `provider.imageOptions.size` on Google
- `provider.imageOptions.inputFidelity` with `createImage()`
- `provider.imageOptions.aspectRatio: "1:8"` with `gemini-3-pro-image-preview`

## Create vs Edit

The SDK still decides the action internally:

### `createImage()`

- OpenAI uses image generation with `action: "generate"`
- Google sends a single-turn create request

### `editImage()`

- OpenAI uses image generation with `action: "edit"`
- Google sends a single-turn edit request with the provided source images

You do not configure those provider actions yourself.
