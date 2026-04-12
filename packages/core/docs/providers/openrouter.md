# OpenRouter Provider Options

`@ank1015/llm-core` forwards OpenRouter-native chat completion fields through `providerOptions`.

OpenRouter uses an OpenAI-compatible Chat Completions surface, but adds its own unified `reasoning` controls across many routed providers and models.

Core manages a few fields for you:

- `model` comes from `getModel('openrouter', ...)`
- `messages` are built from the normalized core message format
- `context.systemPrompt` becomes the leading `system` message

That means OpenRouter-specific reasoning and routing options should be passed directly in `providerOptions`.

## Thinking Variants

Some OpenRouter models expose a dedicated `:thinking` variant. In those cases, the model choice itself enables the reasoning-oriented variant:

```ts
import { complete, getModel } from '@ank1015/llm-core';

const model = getModel('openrouter', 'anthropic/claude-3.7-sonnet:thinking');

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
        content: [{ type: 'text', content: 'Work through this problem carefully.' }],
      },
    ],
  },
  {
    apiKey: process.env.OPENROUTER_API_KEY!,
  },
  'msg-1'
);
```

This is the simplest path when the exact `:thinking` model ID already exists in the core model catalog.

## Unified Reasoning Controls

OpenRouter also supports a unified `reasoning` object. Pass it directly in `providerOptions`:

```ts
const model = getModel('openrouter', 'openai/o3-mini');

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
        content: [{ type: 'text', content: "How would you build the world's tallest skyscraper?" }],
      },
    ],
  },
  {
    apiKey: process.env.OPENROUTER_API_KEY!,
    reasoning: {
      effort: 'high',
    },
  },
  'msg-2'
);
```

OpenRouter will map the unified `reasoning` config to the routed provider's native reasoning controls when the selected model supports them.

## Reasoning Effort

For models that support effort-based reasoning controls, pass one of OpenRouter's normalized effort levels:

- `none`
- `minimal`
- `low`
- `medium`
- `high`
- `xhigh`

Example:

```ts
const result = await complete(
  model,
  {
    messages: [
      {
        role: 'user',
        id: 'user-1',
        content: [{ type: 'text', content: 'Explain the implications of quantum entanglement.' }],
      },
    ],
  },
  {
    apiKey: process.env.OPENROUTER_API_KEY!,
    reasoning: {
      effort: 'low',
    },
  },
  'msg-3'
);
```

## Reasoning Max Tokens

For models that support token-budget style reasoning controls, pass `reasoning.max_tokens`:

```ts
const result = await complete(
  model,
  {
    messages: [
      {
        role: 'user',
        id: 'user-1',
        content: [
          {
            type: 'text',
            content: 'What is the most efficient sorting algorithm for a large dataset?',
          },
        ],
      },
    ],
  },
  {
    apiKey: process.env.OPENROUTER_API_KEY!,
    reasoning: {
      max_tokens: 2000,
    },
  },
  'msg-4'
);
```

OpenRouter may translate this into the routed provider's native mechanism, such as an Anthropic budget or a Gemini thinking budget.

## Excluding Reasoning From The Response

If you want the model to reason internally but not return the reasoning text, pass `exclude: true`:

```ts
const result = await complete(
  model,
  {
    messages: [
      {
        role: 'user',
        id: 'user-1',
        content: [{ type: 'text', content: 'Explain quantum computing in simple terms.' }],
      },
    ],
  },
  {
    apiKey: process.env.OPENROUTER_API_KEY!,
    reasoning: {
      effort: 'high',
      exclude: true,
    },
  },
  'msg-5'
);
```

## Reasoning Continuity Across Turns

When OpenRouter returns visible reasoning text, core normalizes it into `thinking` content and stores the native text on the assistant message as `reasoning_content`.

If you continue a conversation with prior assistant turns produced by this OpenRouter provider, core replays the preserved native assistant message back to OpenRouter. That preserves:

- assistant `content`
- `tool_calls`
- `reasoning_content`

This is enough for standard reasoning continuity flows that rely on raw reasoning text.

Core does not currently document or guarantee round-tripping provider-specific `reasoning_details` structures through the normalized runtime. If you need exact `reasoning_details` preservation semantics for a specific OpenRouter-routed provider, verify that behavior against the native response shape you receive.

## Prompt Caching

Prompt caching on OpenRouter is mostly provider-driven and often automatic.

In practice:

- many routed providers enable caching automatically when the provider and model support it
- OpenRouter uses sticky routing to improve cache hit rates after cached requests
- cache hits show up in usage as `prompt_tokens_details.cached_tokens`

Core surfaces cached prompt reads in normalized usage as `usage.cacheRead`.

If you need the native cache breakdown, inspect:

- `result.message.usage?.prompt_tokens_details?.cached_tokens`
- `result.message.usage?.prompt_tokens_details?.cache_write_tokens`

## Cache-Friendly Prompt Structure

To improve cache hit rates through OpenRouter:

- keep the opening system prompt stable
- keep repeated context and examples near the beginning
- keep changing user-specific content near the end
- keep tool definitions stable across requests when possible

If the routed provider requires explicit cache breakpoints, those provider-specific fields can usually still be passed through `providerOptions` because core forwards OpenAI-compatible request fields directly for OpenRouter.

## References

- [OpenRouter thinking variant](https://openrouter.ai/docs/guides/routing/model-variants/thinking)
- [OpenRouter reasoning tokens](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)
- [OpenRouter prompt caching](https://openrouter.ai/docs/guides/best-practices/prompt-caching)
