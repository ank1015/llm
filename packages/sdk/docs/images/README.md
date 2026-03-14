# Image APIs

`@ank1015/llm-sdk` provides two simple image functions:

- `createImage(...)`
- `editImage(...)`

They are designed for agents and automation code that just wants to:

- send a prompt
- optionally send one or more source images
- choose one of the supported image models inside `provider`
- save the result to disk
- optionally receive live update image files while the model is working

You do not need to know anything about the lower-level packages in this monorepo to use them.

## The Main Idea

This image API is intentionally not a conversation API.

There is:

- no message history to manage
- no session manager integration
- no multi-turn state
- no tool wiring to think about

You make one call for one image task.

That task is either:

- create a new image
- edit an existing image

## The Two Functions

### `createImage()`

Use this when you want to generate a new image from a prompt.

It can also accept optional source images if you want to provide references.

### `editImage()`

Use this when you want to modify an existing image.

It requires at least one input image.

## What the SDK Handles for You

These functions hide the provider-specific details:

- API key resolution
- loading local image files
- downloading remote image URLs
- base64 encoding
- provider request mapping
- streaming image updates
- saving update artifacts to disk
- saving the final image to disk

## What You Get Back

The return value is intentionally tiny:

```ts
{
  path: string;
}
```

That path is the saved final image file.

## Supported Models

Only these model IDs are accepted:

- `gpt-5.4`
- `gemini-3.1-flash-image-preview`
- `gemini-3-pro-image-preview`

## Start Here

Read these in order if you are new:

1. [Getting Started](./getting-started.md)
2. [Models and Options](./models-and-options.md)
3. [Inputs, Outputs, and Files](./inputs-outputs-and-files.md)
4. [Updates and Adapters](./updates-and-adapters.md)
5. [API Reference](./api-reference.md)
