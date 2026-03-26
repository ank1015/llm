---
name: use-llms
description: 'Use the skill to call LLMs in a one off or conversational way.'
---

# Use LLMs

## When To Use

Use this skill in two main cases:

- you want to call an LLM itself for a one-off task or a conversational flow
- you are writing code, scripts, or workflows that need LLM calls and should use the functions from `@ank1015/llm-agents`

## Required Reading Order

1. Read this file first.
2. Read [references/types.md](references/types.md) for the common types and return shapes.
3. If the task is a direct one-shot or streaming call, read [references/stream.md](references/stream.md).
4. If the task needs stateful multi-turn interaction, read [references/conversation.md](references/conversation.md).
5. Read [references/model-selection.md](references/model-selection.md) only when you need to choose between the supported model IDs.

## Main Helpers

Import from the package root:

```ts
import { createManagedConversation, streamLlm } from '@ank1015/llm-agents';
```

This skill exposes two helpers:

- `streamLlm(options)`
  - handles one-off LLM calls
  - resolves the selected model ID from a small built-in model map
  - uses the default file-based key storage automatically
- `createManagedConversation(options)`
  - creates a ready `Conversation`
  - optionally returns a `SessionManager` plus a sessions adapter when `sessions` is enabled

## Important Constraints

- Supported model IDs are `gpt-5.4` and `gpt-5.4-mini`.
- The conversation helper does not automatically create, load, append, or persist sessions. It only returns ready objects.
- Use imports from `@ank1015/llm-agents`.

## Choose The Next Reference

- Read [references/types.md](references/types.md) for the common return types and session return-shape rules.
- Read [references/stream.md](references/stream.md) for one-off request shape and example usage of `streamLlm()`.
- Read [references/conversation.md](references/conversation.md) for conversational usage, session modes, and example usage of `createManagedConversation()`.
- Read [references/model-selection.md](references/model-selection.md) when you need to choose between `gpt-5.4` and `gpt-5.4-mini`.
