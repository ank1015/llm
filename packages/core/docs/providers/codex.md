# Codex Provider Options

`@ank1015/llm-core` uses the OpenAI Responses API shape for the built-in Codex provider and forwards native Responses request fields through `providerOptions`.

Core manages a few fields for you:

- `model` comes from `getModel('codex', ...)`
- `input` is built from the normalized core message format
- `context.systemPrompt` becomes Codex `instructions`
- `store` is always forced to `false`
- `stream` is always managed by core

You must also provide Codex credentials in `providerOptions`:

- `apiKey`
- `'chatgpt-account-id'`

That means Codex-specific reasoning and caching fields like `reasoning`, `prompt_cache_key`, `prompt_cache_retention`, and `include` should be passed directly in `providerOptions` using the native Responses API shape.

## Reasoning Effort

Codex uses the same OpenAI-style `reasoning` object as the OpenAI Responses API:

```ts
import { complete, getModel } from '@ank1015/llm-core';

const model = getModel('codex', 'gpt-5.4');

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
    'chatgpt-account-id': process.env.CHATGPT_ACCOUNT_ID!,
    reasoning: {
      effort: 'medium',
    },
  },
  'msg-1'
);
```

Notes:

- `reasoning.effort` is model-dependent; supported values can include `none`, `minimal`, `low`, `medium`, `high`, and `xhigh`
- reasoning token usage stays on the preserved native response at `result.message.usage?.output_tokens_details?.reasoning_tokens`
- unlike the OpenAI provider, this adapter intentionally strips `max_output_tokens`

## Reasoning Summaries

If the selected Codex model supports reasoning summaries, pass `reasoning.summary` directly:

```ts
const result = await complete(
  model,
  {
    messages: [
      {
        role: 'user',
        id: 'user-2',
        content: [{ type: 'text', content: 'Why is this implementation correct?' }],
      },
    ],
  },
  {
    apiKey: process.env.OPENAI_API_KEY!,
    'chatgpt-account-id': process.env.CHATGPT_ACCOUNT_ID!,
    reasoning: {
      effort: 'low',
      summary: 'auto',
    },
  },
  'msg-2'
);
```

Core preserves the native Responses output on `result.message`, and reasoning summary text is what feeds normalized `thinking` content when Codex returns it.

## Prompt Caching

Codex prompt caching follows the same Responses API model as OpenAI prompt caching. There are no Anthropic-style cache breakpoints here.

For cache-friendly requests:

- keep stable instructions in `context.systemPrompt`
- keep repeated examples, tools, and shared context near the beginning of the prompt
- put user-specific or changing content at the end
- reuse the same cache key for requests that share a long, stable prefix

Core surfaces cached prefix hits in normalized usage as `usage.cacheRead`. The preserved native response also keeps the server-reported value at `result.message.usage?.input_tokens_details?.cached_tokens`.

## Prompt Cache Key

Codex uses `prompt_cache_key` as a normal top-level Responses request field, so pass it directly in `providerOptions`:

```ts
const result = await complete(
  model,
  {
    systemPrompt: 'You are a careful code reviewer.',
    messages: [
      {
        role: 'user',
        id: 'user-3',
        content: [{ type: 'text', content: 'Review this patch and call out any risks.' }],
      },
    ],
  },
  {
    apiKey: process.env.OPENAI_API_KEY!,
    'chatgpt-account-id': process.env.CHATGPT_ACCOUNT_ID!,
    prompt_cache_key: 'code-review-session-1',
  },
  'msg-3'
);
```

Use the same `prompt_cache_key` across turns when you want Codex to keep routing similar prefixes toward the same prompt cache.

## Prompt Cache Retention

If the backing Codex model supports extended retention, pass `prompt_cache_retention` directly:

```ts
const result = await complete(
  model,
  {
    systemPrompt: 'You are a careful code reviewer.',
    messages: [
      {
        role: 'user',
        id: 'user-4',
        content: [{ type: 'text', content: 'Review this patch and call out any risks.' }],
      },
    ],
  },
  {
    apiKey: process.env.OPENAI_API_KEY!,
    'chatgpt-account-id': process.env.CHATGPT_ACCOUNT_ID!,
    prompt_cache_key: 'code-review-session-1',
    prompt_cache_retention: '24h',
  },
  'msg-4'
);
```

Notes:

- prompt caching still works if you omit `prompt_cache_retention`
- exact prefix matching still matters, even with a cache key
- short requests may still report `cached_tokens: 0`

## Current Codex Adapter Notes

There are a few important differences from the built-in OpenAI provider:

- `context.systemPrompt` is sent as `instructions`, not as a leading `developer` message
- `store`, `stream`, `max_output_tokens`, `temperature`, `top_p`, and `truncation` are intentionally stripped or forced by the adapter
- prior Codex assistant turns are rebuilt from normalized content rather than replayed as native Responses `output` items, so native reasoning-item continuity is not guaranteed the same way it is for the OpenAI provider

## References

- [OpenAI reasoning guide](https://developers.openai.com/api/docs/guides/reasoning)
- [OpenAI prompt caching guide](https://developers.openai.com/api/docs/guides/prompt-caching)
- [OpenAI model reference](https://developers.openai.com/api/docs/models)
