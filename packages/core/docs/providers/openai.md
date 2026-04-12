# OpenAI Provider Options

`@ank1015/llm-core` uses the OpenAI Responses API for the built-in OpenAI provider and forwards native Responses request fields through `providerOptions`.

Core manages a few fields for you:

- `model` comes from `getModel('openai', ...)`
- `input` is built from the normalized core message format
- `context.systemPrompt` becomes the leading OpenAI `developer` message

That means OpenAI-specific features like `reasoning`, `max_output_tokens`, `prompt_cache_key`, and `prompt_cache_retention` should be passed directly in `providerOptions` using the native Responses API shape.

## Reasoning Effort

Pass OpenAI's `reasoning` object directly in `providerOptions`:

```ts
import { complete, getModel } from '@ank1015/llm-core';

const model = getModel('openai', 'gpt-5.4');

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
        content: [{ type: 'text', content: 'Plan a safe refactor for this module.' }],
      },
    ],
  },
  {
    apiKey: process.env.OPENAI_API_KEY!,
    reasoning: {
      effort: 'medium',
    },
    max_output_tokens: 4000,
  },
  'msg-1'
);
```

Notes:

- `reasoning.effort` is model-dependent; OpenAI defines values such as `none`, `minimal`, `low`, `medium`, `high`, and `xhigh`, but not every model supports every value
- `max_output_tokens` is the cap for both reasoning tokens and visible output tokens
- detailed reasoning token counts stay on the preserved native response at `result.message.usage?.output_tokens_details?.reasoning_tokens`

## Reasoning Summaries

OpenAI does not expose raw reasoning tokens, but some reasoning models can return a summary. If you want reasoning summaries in the native response, pass `reasoning.summary`:

```ts
const result = await complete(
  model,
  {
    messages: [
      {
        role: 'user',
        id: 'user-1',
        content: [{ type: 'text', content: 'Why is this implementation correct?' }],
      },
    ],
  },
  {
    apiKey: process.env.OPENAI_API_KEY!,
    reasoning: {
      effort: 'low',
      summary: 'auto',
    },
  },
  'msg-2'
);
```

This is the OpenAI-native way to ask for a reasoning summary. Core preserves the returned `reasoning` items on `result.message.output`, and summary text is what feeds normalized `thinking` content when OpenAI returns it.

## Stateless Multi-turn Reasoning

If you are using stateless OpenAI Responses conversations and want reasoning items to be reusable across turns, include encrypted reasoning content:

```ts
const result = await complete(
  model,
  {
    messages: [
      {
        role: 'user',
        id: 'user-1',
        content: [{ type: 'text', content: 'Use tools if needed and explain your result.' }],
      },
    ],
  },
  {
    apiKey: process.env.OPENAI_API_KEY!,
    store: false,
    include: ['reasoning.encrypted_content'],
    reasoning: {
      effort: 'medium',
    },
  },
  'msg-3'
);
```

When prior assistant messages come from this OpenAI provider, core replays native OpenAI `reasoning`, `message`, and `function_call` items from the preserved response. That lets later turns keep using OpenAI's native conversation state items instead of flattening everything into plain text.

## Prompt Caching

OpenAI prompt caching is automatic. You do not add explicit cache markers like Anthropic's `cache_control`.

For cache-friendly requests:

- keep stable instructions in `context.systemPrompt`
- keep repeated examples, tools, and earlier shared context near the beginning of the prompt
- put user-specific or changing content at the end
- keep tool definitions identical between requests when you want cache hits

OpenAI prompt caching is only eligible for sufficiently long prompts. Short requests will still return usage fields, but `cached_tokens` will stay `0`.

Core surfaces OpenAI cached prefix hits in normalized usage as `usage.cacheRead`. The preserved native response also keeps the OpenAI usage breakdown at `result.message.usage?.input_tokens_details?.cached_tokens`.

## Prompt Cache Key

If you want to improve cache routing for requests that share the same prefix, pass `prompt_cache_key` directly:

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
    apiKey: process.env.OPENAI_API_KEY!,
    prompt_cache_key: 'code-review-v1',
  },
  'msg-4'
);
```

Use the same `prompt_cache_key` across requests that share a long, stable prefix.

## Prompt Cache Retention

If you want extended cache retention on supported models, pass `prompt_cache_retention`:

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
    apiKey: process.env.OPENAI_API_KEY!,
    prompt_cache_key: 'code-review-v1',
    prompt_cache_retention: '24h',
  },
  'msg-5'
);
```

Notes:

- prompt caching still works if you omit `prompt_cache_retention`
- extended retention is model-dependent
- exact prefix matching still matters, even with a cache key or longer retention

## References

- [OpenAI reasoning guide](https://developers.openai.com/api/docs/guides/reasoning)
- [OpenAI prompt caching guide](https://developers.openai.com/api/docs/guides/prompt-caching)
- [OpenAI model reference](https://developers.openai.com/api/docs/models)
