# Google Provider Options

`@ank1015/llm-core` forwards Gemini-native `GenerateContentConfig` fields through `providerOptions`.

Core manages a few fields for you:

- `model` comes from `getModel('google', ...)`
- `contents` are built from the normalized core message format
- `context.systemPrompt` becomes `config.systemInstruction`

That means Gemini-specific features like `thinkingConfig` and `cachedContent` should be passed directly in `providerOptions` using the native Google GenAI config shape.

## Thought Summaries

If you want Gemini thought summaries in the response, pass `thinkingConfig.includeThoughts`:

```ts
import { complete, getModel } from '@ank1015/llm-core';

const model = getModel('google', 'gemini-3-flash-preview');

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
        content: [{ type: 'text', content: 'What is the sum of the first 50 prime numbers?' }],
      },
    ],
  },
  {
    apiKey: process.env.GEMINI_API_KEY!,
    thinkingConfig: {
      includeThoughts: true,
    },
  },
  'msg-1'
);
```

When Gemini returns thought summaries, core normalizes them into `thinking` content and `thinking_*` stream events. The full native response is still preserved on `result.message`.

## Thinking Level

For Gemini 3 models, use `thinkingConfig.thinkingLevel`:

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
            content: 'Provide a list of 3 famous physicists and their key contributions.',
          },
        ],
      },
    ],
  },
  {
    apiKey: process.env.GEMINI_API_KEY!,
    thinkingConfig: {
      thinkingLevel: 'LOW',
    },
  },
  'msg-2'
);
```

Notes:

- `thinkingLevel` is the recommended control for Gemini 3 models
- Gemini uses dynamic thinking by default when you do not set a level
- supported values are model-dependent; common values are `MINIMAL`, `LOW`, `MEDIUM`, and `HIGH`

## Thinking Budget

For Gemini 2.5-style thinking controls, use `thinkingConfig.thinkingBudget`:

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
            content: 'Provide a list of 3 famous physicists and their key contributions.',
          },
        ],
      },
    ],
  },
  {
    apiKey: process.env.GEMINI_API_KEY!,
    thinkingConfig: {
      thinkingBudget: 1024,
    },
  },
  'msg-3'
);
```

Common patterns:

- `thinkingBudget: 0` disables thinking on models that support disabling it
- `thinkingBudget: -1` turns on dynamic thinking on models that support it
- Gemini 3 models prefer `thinkingLevel`; `thinkingBudget` is mainly for Gemini 2.5 compatibility

The current built-in Google models in core are Gemini 3 preview models, so `thinkingLevel` is the more natural choice for those entries.

## Thought Token Usage

Gemini bills thought tokens as part of output usage. Core folds Gemini thought tokens into normalized `usage.output`.

If you need the native breakdown, inspect the preserved response:

- `result.message.usageMetadata?.thoughtsTokenCount`
- `result.message.usageMetadata?.candidatesTokenCount`

## Context Caching

Gemini implicit caching is automatic on supported newer models. There is nothing to enable in `providerOptions`.

To improve cache hit chances:

- keep stable instructions and repeated context at the beginning of the prompt
- keep changing user-specific content at the end
- send similar-prefix requests close together

Core surfaces Gemini cache hits in normalized usage as `usage.cacheRead`. The native cache-hit count is also preserved on `result.message.usageMetadata?.cachedContentTokenCount`.

## Explicit Cached Content

If you already created a Gemini cached content object outside core, you can reuse it by passing its name as `cachedContent`:

```ts
const result = await complete(
  model,
  {
    messages: [
      {
        role: 'user',
        id: 'user-1',
        content: [{ type: 'text', content: 'Please summarize this transcript.' }],
      },
    ],
  },
  {
    apiKey: process.env.GEMINI_API_KEY!,
    cachedContent: 'cachedContents/abc123',
  },
  'msg-4'
);
```

Core forwards `cachedContent` directly into Gemini's `GenerateContentConfig`.

## Current Scope In Core

This runtime can use an existing Gemini cache name through `cachedContent`, but it does not currently create, list, update, or delete Gemini caches for you. If you need explicit cache lifecycle management, create the cache outside core and then pass the returned cache name in `providerOptions`.

## References

- [Gemini thinking guide](https://ai.google.dev/gemini-api/docs/thinking)
- [Gemini context caching guide](https://ai.google.dev/gemini-api/docs/context-caching)
- [Gemini model overview](https://ai.google.dev/gemini-api/docs/models)
