# Anthropic Provider Options

`@ank1015/llm-core` forwards Anthropic-native request fields through `providerOptions`.

Core manages a few fields for you:

- `model` comes from `getModel('anthropic', ...)`
- `messages` are built from the normalized core message format
- `system` is built from `context.systemPrompt`
- `max_tokens` defaults to the selected model's `maxTokens` when omitted

That means Anthropic-specific features like `thinking` and `output_config` should be passed directly in `providerOptions` using Anthropic's native shape.

## Adaptive Thinking

For adaptive thinking, pass Anthropic's `thinking` config directly:

```ts
import { complete, getModel } from '@ank1015/llm-core';

const model = getModel('anthropic', 'claude-sonnet-4-6');

if (!model) {
  throw new Error('Model not found');
}

const result = await complete(
  model,
  {
    messages: [
      {
        role: 'user',
        id: 'user-1',
        content: [{ type: 'text', content: 'Review this function and suggest improvements.' }],
      },
    ],
  },
  {
    apiKey: process.env.ANTHROPIC_API_KEY!,
    max_tokens: 16000,
    thinking: {
      type: 'adaptive',
    },
  },
  'msg-1'
);
```

Use adaptive thinking on the Anthropic models in core that support it:

- `claude-opus-4-6`
- `claude-sonnet-4-6`

## Thinking Effort

To guide how much thinking Anthropic uses, pass `output_config.effort` alongside adaptive thinking:

```ts
const result = await complete(
  model,
  {
    messages: [
      {
        role: 'user',
        id: 'user-1',
        content: [{ type: 'text', content: 'Plan a safe refactor for this module.' }],
      },
    ],
  },
  {
    apiKey: process.env.ANTHROPIC_API_KEY!,
    max_tokens: 16000,
    thinking: {
      type: 'adaptive',
    },
    output_config: {
      effort: 'medium',
    },
  },
  'msg-2'
);
```

Supported effort values are:

- `low`
- `medium`
- `high`
- `max`

Notes:

- `high` is Anthropic's default behavior, so omitting `output_config.effort` is equivalent to `high`
- `max_tokens` is still the hard output cap
- `effort` can also be passed without `thinking`, but Anthropic recommends pairing it with `thinking: { type: 'adaptive' }` on Opus 4.6 and Sonnet 4.6

## Manual Thinking

If you need to pass manual thinking settings, use Anthropic's native `thinking` object directly:

```ts
const result = await complete(
  model,
  {
    messages: [
      {
        role: 'user',
        id: 'user-1',
        content: [{ type: 'text', content: 'Work through this step by step.' }],
      },
    ],
  },
  {
    apiKey: process.env.ANTHROPIC_API_KEY!,
    max_tokens: 16000,
    thinking: {
      type: 'enabled',
      budget_tokens: 4096,
    },
  },
  'msg-3'
);
```

Core does not rename or wrap these Anthropic fields. If Anthropic supports a `thinking` or `output_config` property, pass it in `providerOptions` as-is.

## Prompt Caching

For prompt caching, pass Anthropic's top-level `cache_control` object directly in `providerOptions`:

```ts
const result = await complete(
  model,
  {
    systemPrompt: 'You are a careful code reviewer.',
    messages: [
      {
        role: 'user',
        id: 'user-1',
        content: [{ type: 'text', content: 'Review this patch and call out any risks.' }],
      },
    ],
  },
  {
    apiKey: process.env.ANTHROPIC_API_KEY!,
    max_tokens: 4096,
    cache_control: {
      type: 'ephemeral',
    },
  },
  'msg-4'
);
```

This uses Anthropic's automatic caching mode. Core forwards the top-level `cache_control` field as-is.

### 1-hour TTL

If you want Anthropic's longer cache lifetime, pass `ttl` in the same object:

```ts
const result = await complete(
  model,
  {
    systemPrompt: 'You are a careful code reviewer.',
    messages: [
      {
        role: 'user',
        id: 'user-1',
        content: [{ type: 'text', content: 'Review this patch and call out any risks.' }],
      },
    ],
  },
  {
    apiKey: process.env.ANTHROPIC_API_KEY!,
    max_tokens: 4096,
    cache_control: {
      type: 'ephemeral',
      ttl: '1h',
    },
  },
  'msg-5'
);
```

### What works well in core

- top-level `cache_control` works through `providerOptions`
- Anthropic cache usage is surfaced in normalized usage as `usage.cacheRead` and `usage.cacheWrite`
- `context.systemPrompt` is already converted into an Anthropic system text block with `cache_control: { type: 'ephemeral' }` by the current adapter

If you need Anthropic's more detailed cache usage fields, read the preserved native response on `result.message.usage`, for example `cache_creation`.

Because core owns `messages`, `system`, and normalized `context.tools`, automatic caching is the easiest and most complete caching option in this runtime today.

### Current limits

Anthropic also supports explicit cache breakpoints on individual blocks, but core does not currently expose that full block-level control for normalized inputs:

- you cannot attach `cache_control` to individual normalized message content blocks through core's `context.messages`
- you cannot attach `cache_control` to individual `context.tools` definitions
- you cannot override the generated Anthropic `system` blocks through `providerOptions`, because core builds `system` from `context.systemPrompt`

If you need fine-grained Anthropic cache breakpoints on specific message, system, or tool blocks, that would require additional adapter support in core.

### Caching and thinking

If you use prompt caching with thinking, keep the thinking mode consistent across turns. Changing between adaptive, manual, and disabled thinking can invalidate Anthropic's message cache prefixes.

## References

- [Anthropic adaptive thinking](https://docs.anthropic.com/en/docs/build-with-claude/adaptive-thinking)
- [Anthropic effort parameter](https://docs.anthropic.com/en/docs/build-with-claude/effort)
- [Anthropic prompt caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)
