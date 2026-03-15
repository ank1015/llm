---
name: ai-images
description: 'Create brand-new images or edit existing images with state-of-the-art image generation models. Use this skill when the task involves image generation, visual variations, or image transformation.'
---

# AI Images

## When To Use

Use this skill when the user wants to:

- generate a new image from a prompt
- create image variations from reference images
- edit or transform one or more existing images
- use the latest image models exposed through `@ank1015/llm-agents`

## Required Reading Order

1. Read this file first.
2. If the task needs model selection help or the best image model is not obvious, read [references/choose-model.md](references/choose-model.md).
3. If the task is generating a new image, read [references/create.md](references/create.md).
4. If the task is editing or transforming an existing image, read [references/edit.md](references/edit.md).
5. Do not read both task references unless the task genuinely includes both create and edit flows.

## Available Functions

- `createImage(request)`
  - create a new image from a prompt
  - optionally condition the generation on reference images
- `editImage(request)`
  - modify or transform one or more existing images
  - requires at least one input image

Import from the package root:

```ts
import { createImage, editImage } from '@ank1015/llm-agents';
```

## Choose The Next Reference

- Read [references/choose-model.md](references/choose-model.md) when you need to choose between `gpt-5.4`, `gemini-3.1-flash-image-preview`, and `gemini-3-pro-image-preview`.
- Read [references/create.md](references/create.md) for request shape, model-specific create options, output behavior, and example usage of `createImage()`.
- Read [references/edit.md](references/edit.md) for request shape, supported inputs, model-specific edit options, output behavior, and example usage of `editImage()`.

Load only the reference that matches the current task so you do not pull unnecessary context into
the conversation.
