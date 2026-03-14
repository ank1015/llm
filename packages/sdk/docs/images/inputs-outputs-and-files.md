# Inputs, Outputs, and Files

This guide explains what the functions accept and what they save.

## Input Shape

Both functions take a single object argument.

### Shared fields

```ts
{
  provider: ImageProvider;
  prompt: string;
  outputDir: string;
  outputName?: string;
  keysAdapter?: KeysAdapter;
  usageAdapter?: UsageAdapter;
  systemPrompt?: string;
  onUpdate?: (update) => void | Promise<void>;
}
```

### `createImage()`

```ts
{
  ...sharedFields,
  images?: string | readonly string[];
}
```

### `editImage()`

```ts
{
  ...sharedFields,
  images: string | readonly string[];
}
```

## The `provider` Object

The provider object is where you choose:

- which vendor API to use
- which model to use
- whether to pass `apiKey` directly
- which image options are valid for that provider

Example:

```ts
provider: {
  model: "gpt-5.4",
  apiKey: process.env.OPENAI_API_KEY!,
  imageOptions: {
    size: "1024x1024",
    format: "png",
  },
}
```

or:

```ts
provider: {
  model: "gemini-3.1-flash-image-preview",
  imageOptions: {
    aspectRatio: "16:9",
    imageSize: "2K",
  },
}
```

## Source Images

Each source image is a string.

That string can be:

- a local file path
- a remote `http(s)` URL

Examples:

```ts
images: './input/horse.jpg';
```

```ts
images: ['./input/horse.jpg', './input/saddle.png', 'https://example.com/reference.webp'];
```

## Local Image Handling

For local files, the SDK:

- reads the file
- detects the image type
- base64-encodes it
- sends it to the selected model

If the SDK cannot determine a supported image type, it throws before calling the provider.

## Remote URL Handling

For remote URLs, the SDK:

- downloads the file with `fetch`
- checks the response
- detects the image type from content type, bytes, or URL extension
- base64-encodes it

Only public `http(s)` URLs are supported in v1.

There is no custom-header or authenticated URL support in this API.

## Final Output File

The final image is saved as:

```text
<outputDir>/<outputName or generated-name>.<extension>
```

Examples:

```text
/tmp/output/white-horse.png
```

```text
/tmp/output/brown-horse.jpg
```

The function returns:

```ts
{
  path: string;
}
```

That `path` is the final saved image path.

## Update Artifact Files

Update files are saved separately under:

```text
<outputDir>/<baseName>__updates/
```

Examples:

```text
/tmp/output/white-horse__updates/partial-001.png
/tmp/output/white-horse__updates/final-001.png
```

The SDK writes these stage-based update files:

- `partial-001.*`, `partial-002.*`, ...
- `thought-001.*`, `thought-002.*`, ...
- `final-001.*`, `final-002.*`, ...

In practice, the API only keeps the first final image as the main result. That keeps the return value simple.

## Final Image vs Final Update Artifact

The API saves the final image in two ways:

1. the main final file returned in `{ path }`
2. a final update artifact in the `__updates` folder

Why both exist:

- the main final file is the simple final result
- the update artifact keeps the streaming/update timeline consistent

## Paths Returned by the API

The SDK resolves `outputDir` and returns file paths inside that resolved directory.

This means the returned path is ready to use directly in most agent or Node.js flows.
