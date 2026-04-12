# Recommendations

Use `image()` in the most boring way possible:

- Prefer the central keystore first.
- Prefer Google when both providers can do the job.
- Prefer `nano-banana` for normal work.
- Prefer `nano-banana-pro` when the asset matters more.
- Use `gpt-image` when you specifically need its controls.

## Keys

Check the central keystore first:

```ts
import { getAvailableKeyProviders } from '@ank1015/llm-sdk/keys';

const availableProviders = await getAvailableKeyProviders();
```

If `google` or `openai` is already available there:

- call `image()` normally
- do not pass `keysFilePath`

Only create or pass a custom keys file when the needed provider is not available centrally.

## Model Choice

Use this order:

1. If the user explicitly asks for OpenAI, use `gpt-image`.
2. If the task clearly needs masks, multiple outputs in one call, transparent backgrounds, or exact output format and compression control, use `gpt-image`.
3. Otherwise prefer Google.
4. Within Google, use `nano-banana-pro` for higher-stakes assets and `nano-banana` for everything else.

## When To Use `nano-banana`

Use it for:

- everyday image generation
- normal edits and reference-image work
- quick concepting
- most app, product, and document visuals

## When To Use `nano-banana-pro`

Use it for:

- client-facing deliverables
- important marketing or editorial visuals
- prompts with more constraints
- polished text-in-image work
- final-pass assets where you want to spend the extra quality budget

## When To Use `gpt-image`

Use it for:

- mask-based editing
- multiple images in a single call
- transparent background work
- explicit control over output format and compression
- cases where the user specifically wants OpenAI output

## Output Paths

Always choose a clear `output` path up front.

Practical rule:

- if you expect one image, use a file-like base path such as `./artifacts/poster.png`
- if you may get multiple images, still use one base path and read `result.paths`

Remember:

- the final extension may change based on the provider output
- `result.paths` is the source of truth
