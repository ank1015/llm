# Z.AI Provider Options

`@ank1015/llm-core` forwards Z.AI-native chat completion fields through `providerOptions`.

Z.AI uses an OpenAI-compatible Chat Completions payload, with a native `thinking` option for reasoning control.

Core manages a few fields for you:

- `model` comes from `getModel('zai', ...)`
- `messages` are built from the normalized core message format
- `context.systemPrompt` becomes the leading `system` message

That means Z.AI-specific reasoning control should be passed directly in `providerOptions.thinking`.

## Default Thinking Behavior

For the built-in reasoning Z.AI models in core, thinking is enabled by default when you do not pass a `thinking` option.

```ts
import { complete, getModel } from '@ank1015/llm-core';

const model = getModel('zai', 'glm-5');

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
        content: [{ type: 'text', content: 'Design a recommendation system architecture.' }],
      },
    ],
  },
  {
    apiKey: process.env.ZAI_API_KEY!,
  },
  'msg-1'
);
```

For `glm-5`, core will send:

```ts
thinking: {
  type: 'enabled';
}
```

unless you override it explicitly.

## Disable Thinking

If you want a faster direct answer, disable thinking explicitly:

```ts
const result = await complete(
  model,
  {
    messages: [
      {
        role: 'user',
        id: 'user-1',
        content: [{ type: 'text', content: 'How is the weather today?' }],
      },
    ],
  },
  {
    apiKey: process.env.ZAI_API_KEY!,
    thinking: {
      type: 'disabled',
    },
  },
  'msg-2'
);
```

This is the Z.AI-native way to turn off deep thinking for a turn.

## Preserved Thinking

For coding or agent-style multi-turn flows, you can enable preserved thinking with `clear_thinking: false`:

```ts
const result = await complete(
  model,
  {
    messages: [
      {
        role: 'user',
        id: 'user-1',
        content: [{ type: 'text', content: 'Debug this issue step by step.' }],
      },
    ],
  },
  {
    apiKey: process.env.ZAI_API_KEY!,
    thinking: {
      type: 'enabled',
      clear_thinking: false,
    },
  },
  'msg-3'
);
```

Notes:

- `clear_thinking: false` is the Z.AI switch for preserved thinking on the standard API endpoint
- preserved thinking only helps if you keep the returned assistant turn intact across turns
- core preserves the native Z.AI assistant message, including `reasoning_content`, on `result.message`

If you continue a conversation with prior assistant messages produced by this Z.AI provider, core replays the original native assistant message back to Z.AI. That preserves `reasoning_content` and tool calls without you having to rebuild them manually.

## Interleaved Thinking With Tools

Z.AI supports interleaved thinking with tools by default. There is no separate provider option you need to add for that mode.

The main thing to preserve is the assistant turn returned by the model. When the previous assistant message comes from Z.AI, core sends the original native message back, including:

- `reasoning_content`
- `tool_calls`
- assistant `content`

That is the safest way to keep Z.AI's reasoning continuity across tool-use turns.

## Turn-level Thinking

Z.AI lets you control thinking per request. In core, that means each `complete()` or `stream()` call can choose its own `thinking` setting:

- omit `thinking` to use the model's default behavior
- pass `thinking: { type: 'enabled' }` to force thinking on
- pass `thinking: { type: 'disabled' }` to force thinking off
- pass `thinking: { type: 'enabled', clear_thinking: false }` for preserved thinking flows

## Reasoning Content

When Z.AI returns reasoning text, core normalizes it into `thinking` content and `thinking_*` stream events.

The original native field is also preserved on the assistant message:

- `result.message.choices[0]?.message?.reasoning_content`

That preserved native value is what allows later turns to round-trip Z.AI reasoning faithfully.

## Context Caching

Z.AI context caching is automatic. There is no separate cache configuration field to pass in `providerOptions`.

To improve cache hit chances:

- keep stable system prompts at the beginning
- keep repeated conversation history unchanged where possible
- put the changing user request at the end

Core surfaces Z.AI cache hits in normalized usage as `usage.cacheRead`.

If you need the native cache breakdown, inspect:

- `result.message.usage?.prompt_tokens_details?.cached_tokens`

## References

- [Z.AI Thinking Mode](https://docs.z.ai/guides/capabilities/thinking-mode)
- [Z.AI Deep Thinking](https://docs.z.ai/guides/capabilities/thinking)
- [Z.AI Context Caching](https://docs.z.ai/guides/capabilities/cache)
