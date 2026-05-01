---
name: llm-sdk
description: Use when you want to call LLMs with one-off `llm()` calls or stateful `agent()` loops through `@ank1015/llm-sdk`. Covers curated model IDs, message and response helpers, TypeBox-based tool definitions, gateway-first transport, direct-key opt-out, and default session handling.
---

# LLM SDK

Use this skill when working with llm's. This skill uses the library called @ank1015/llm-sdk and only works in node runtimes.

## Choose The Entry Point

- Use `llm()` for one-off model calls, streaming, or manual tool loops. Read [references/llm.md](./references/llm.md) for the full API, model IDs, response helpers, and examples.
- Use `agent()` for multi-turn runs with automatic tool execution and persisted session history. Read [references/agent.md](./references/agent.md) for the run model, event stream, session behavior, and result union.
- Use [references/recommandation.md](./references/recommandation.md) for the gateway-first workflow, direct-key opt-out, model preference order, and default session guidance.
- Use [references/types.md](./references/types.md) when you need exact exported types.

## Follow These Defaults

- Import common helpers from `@ank1015/llm-sdk`.
- Import config, keys, or session helpers from the documented subpaths only:
  `@ank1015/llm-sdk/config`, `@ank1015/llm-sdk/keys`, `@ank1015/llm-sdk/session`.
- Use literal curated `modelId` strings so TypeScript can infer provider-specific `overrideProviderSetting` types.
- Use `userMessage()` and `toolResultMessage()` instead of hand-writing common message objects.
- Use `tool()` plus `Type.Object(...)` when defining executable agent tools.
- Use `getText()`, `getThinking()`, and `getToolCalls()` instead of manually walking nested response arrays unless you truly need custom handling.
- Use the default gateway credentials file unless the code explicitly opts into direct mode.
- Use `setSdkConfig({ modelTransport: 'direct' })` before relying on `keysFilePath` or `getAvailableKeyProviders()`.
- Prefer default session behavior for `agent()` unless code explicitly needs to resume, inspect, or isolate a specific session file.

## Remember The Key Behavioral Differences

- `llm()` takes the full `messages` history for the request.
- `agent()` takes only new `inputMessages`; prior history is loaded from the session automatically.
- `llm()` does not execute tools. Handle tool calls yourself and append `ToolResultMessage` values manually.
- `agent()` executes `AgentTool` definitions automatically and persists run output to the session.
- Do not consume the same run both ways at once. Pick one pattern:
  await the run, or iterate it and await after the loop finishes.

## Use The Recommended Selection Flow

1. Ask the user which provider/model they want when that choice matters.
2. If they do not care, use `openai/gpt-5.4-mini` for general work or `anthropic/claude-sonnet-4-6` for Claude-specific work.
3. Use `azure-openai/...` only when the user explicitly wants the Azure OpenAI provider; `openai/...` routes to the OpenAI provider.
4. Use direct mode only when a local provider key workflow is explicitly needed.
5. Let `agent()` use the default session location unless you explicitly need a custom path.

## Start With These Patterns

One-off call:

```ts
import { getText, llm, userMessage } from '@ank1015/llm-sdk';

const message = await llm({
  modelId: 'openai/gpt-5.4-mini',
  messages: [userMessage('Explain event loops in two sentences.')],
});

console.log(getText(message));
```

Stateful agent run:

```ts
import { agent, getText, userMessage } from '@ank1015/llm-sdk';

const result = await agent({
  modelId: 'anthropic/claude-sonnet-4-6',
  inputMessages: [userMessage('Summarize the latest session state.')],
});

if (!result.ok) {
  throw new Error(result.error.message);
}

console.log(result.sessionPath);
console.log(getText(result.finalAssistantMessage));
```

## Read The Right Reference File

- Need exact `llm()` input, stream, or response details: read [references/llm.md](./references/llm.md)
- Need exact `agent()` input, events, or result details: read [references/agent.md](./references/agent.md)
- Need the key and session recommendations: read [references/recommandation.md](./references/recommandation.md)
- Need message, tool, response, or session hook types: read [references/types.md](./references/types.md)
