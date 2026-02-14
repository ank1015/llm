---
name: sdk-skill
description: >
  Guide for building LLM-powered applications with the @ank1015/llm-sdk package.
  Use when the user wants to: (1) make LLM calls (complete/stream) with any supported provider
  (Anthropic, OpenAI, Google, DeepSeek, Kimi, Z.AI, MiniMax, Cerebras, OpenRouter, Codex, Claude Code),
  (2) build agents with tool execution using the Conversation class,
  (3) set up credential storage, usage tracking, or session persistence via adapters,
  (4) stream LLM responses for real-time UIs,
  (5) manage conversation sessions with branching history,
  (6) look up models, calculate costs, or configure providers.
  Triggers on: "use the SDK", "make an LLM call", "build a chatbot", "create an agent with tools",
  "stream responses", "track usage", "manage sessions", "set up API keys".
---

# @ank1015/llm-sdk

Unified SDK for multi-provider LLM interactions with adapters for credentials, usage tracking, and sessions.

## Install

```bash
pnpm add @ank1015/llm-sdk @ank1015/llm-sdk-adapters
```

## Quick Start — One-shot Completion

```ts
import { complete, getModel } from '@ank1015/llm-sdk';

const model = getModel('anthropic', 'claude-sonnet-4-5')!;
const result = await complete(
  model,
  {
    messages: [{ role: 'user', id: '1', content: [{ type: 'text', content: 'Hello' }] }],
  },
  { providerOptions: { apiKey: process.env.ANTHROPIC_API_KEY! } }
);

console.log(result.content); // AssistantResponse[]
console.log(result.usage.cost); // { input, output, cacheRead, cacheWrite, total }
```

## What Are You Building?

| Goal                                          | Reference                                                     |
| --------------------------------------------- | ------------------------------------------------------------- |
| Simple LLM call (complete or stream)          | [simple-calls.md](references/simple-calls.md)                 |
| Agent with tools (Conversation class)         | [conversation.md](references/conversation.md)                 |
| Credential storage, usage tracking            | [adapters.md](references/adapters.md)                         |
| Session persistence and branching             | [sessions.md](references/sessions.md)                         |
| Model lookup, provider config, costs          | [models-and-providers.md](references/models-and-providers.md) |
| Type shapes (messages, tools, events, errors) | [types.md](references/types.md)                               |

## Key Exports (Grouped)

**LLM Calls:** `complete`, `stream`, `CompleteOptions`, `StreamOptions`

**Conversation:** `Conversation`, `ConversationOptions`, `ConversationExternalCallback`

**Sessions:** `SessionManager`, `createSessionManager`

**Credentials:** `resolveApiKey`, `resolveProviderCredentials`

**Models:** `MODELS`, `getModel`, `getModels`, `getProviders`, `calculateCost`, `VERSION`

**Agent Loop (advanced):** `runAgentLoop`, `buildUserMessage`, `buildToolResultMessage`, `getMockMessage`

**Streaming:** `EventStream`, `AssistantMessageEventStream`, `parseStreamingJson`

**Utilities:** `generateUUID`, `validateToolCall`, `validateToolArguments`, `isContextOverflow`, `sanitizeSurrogates`

**Provider Stream Fns:** `streamAnthropic`, `streamOpenAI`, `streamGoogle`, `streamDeepSeek`, `streamZai`, `streamKimi`

**Errors:** `LLMError`, `ApiKeyNotFoundError`, `CostLimitError`, `ContextLimitError`, `ConversationBusyError`, `ModelNotConfiguredError`

**Types:** `Api`, `Model`, `Provider`, `Message`, `UserMessage`, `BaseAssistantMessage`, `ToolResultMessage`, `CustomMessage`, `Content`, `Context`, `Tool`, `AgentTool`, `AgentEvent`, `AgentState`, `Usage`, `StopReason`, `AssistantResponse`, `AssistantToolCall`, `BaseAssistantEvent`, `Attachment`, `QueuedMessage`

**Adapter Interfaces:** `KeysAdapter`, `UsageAdapter`, `SessionsAdapter`
