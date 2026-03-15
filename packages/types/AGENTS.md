# @ank1015/llm-types

Shared contracts package for the LLM SDK monorepo. This package is mostly compile-time types, with a very small shared runtime surface: `KnownApis`, `isValidApi`, and the `LLMError` hierarchy.

## Commands

- `pnpm build` — Compile TypeScript to `dist/`
- `pnpm dev` — Watch mode compilation
- `pnpm typecheck` — Type-check without emitting

## Structure

```text
src/
  index.ts          — Public barrel (all exports)
  api.ts            — Api union, KnownApis array, isValidApi guard
  content.ts        — Text, image, file content + generated image metadata
  message.ts        — Message shapes, usage, assistant responses, streaming events
  model.ts          — Model<TApi>, Provider<TApi>
  tool.ts           — Tool definition (TypeBox), Context
  errors.ts         — LLMError hierarchy
  agent-types.ts    — AgentTool, AgentEvent, AgentState, AgentLoopConfig
  adapters.ts       — KeysAdapter, UsageAdapter, SessionsAdapter interfaces
  session.ts        — Session tree contracts (JSONL append-only storage)
  providers/
    index.ts        — ApiNativeResponseMap, ApiOptionsMap, re-exports
    anthropic.ts    — Anthropic native response + options
    claude-code.ts  — Claude Code native response + options
    minimax.ts      — MiniMax native response + options
    openai.ts       — OpenAI native response + options
    codex.ts        — Codex native response + options
    google.ts       — Google native response + options
    deepseek.ts     — DeepSeek native response + options
    kimi.ts         — Kimi native response + options
    zai.ts          — Z.AI native response + options
    cerebras.ts     — Cerebras native response + options
    openrouter.ts   — OpenRouter native response + options
```

## Key Types

### Core Contracts

- `Api` — Union of supported providers derived from `KnownApis`
- `Content` — Array of `TextContent | ImageContent | FileContent`
- `Message` — `UserMessage | ToolResultMessage | BaseAssistantMessage<Api> | CustomMessage`
- `BaseAssistantMessage<TApi>` — Normalized assistant message with preserved native provider response
- `BaseAssistantEvent<TApi>` — Streaming event union covering text, thinking, image, tool call, done, and error events
- `Model<TApi>` — Model metadata (provider, pricing, context window, capabilities)
- `Provider<TApi>` — Model + provider options pair
- `Tool` — Tool definition with a TypeBox parameter schema
- `Context` — Conversation context: messages, system prompt, tools
- `Usage` — Token counts + cost breakdown in USD
- `StopReason` — `'stop' | 'length' | 'toolUse' | 'error' | 'aborted'`

### Provider Type Maps

- `ApiNativeResponseMap` — Maps each `Api` to its native SDK response type
- `NativeResponseForApi<TApi>` — Lookup helper for native response
- `ApiOptionsMap` — Maps each `Api` to its provider options type
- `OptionsForApi<TApi>` — Lookup helper for options
- `WithOptionalKey<T>` — Makes `apiKey` optional at boundaries where it is injected externally

### Agent Contracts

- `AgentTool` — Extends `Tool` with `label` and `execute`
- `AgentToolResult<T>` — Tool execution result with normalized content + UI details
- `AgentState` — Full agent state snapshot
- `AgentLoopConfig` — Stateless agent loop configuration
- `AgentEvent` — Lifecycle event union for agent execution
- `Attachment` — File/image attachment input for user messages
- `QueuedMessage<T>` — Message to inject on the next turn
- `ToolExecutionContext` — Read-only conversation history for tool execution

### Storage Contracts

- `KeysAdapter` — API key / credential storage
- `UsageAdapter` — Usage tracking and stats
- `SessionsAdapter` — Session CRUD, branching, history, search
- `SessionNode` — `SessionHeader | MessageNode | CustomNode`
- `Session`, `SessionSummary`, `BranchInfo` — Session views and metadata

### Errors

- `LLMError` — Base error class with `code: LLMErrorCode`
- `ApiKeyNotFoundError`
- `CostLimitError`
- `ContextLimitError`
- `ConversationBusyError`
- `ModelNotConfiguredError`
- `SessionNotFoundError`
- `InvalidParentError`
- `PathTraversalError`

## Provider Families

- Anthropic Messages-style: `anthropic`, `claude-code`, `minimax`
- OpenAI Responses-style: `openai`, `codex`
- Google GenAI-style: `google`
- OpenAI Chat Completions-style: `deepseek`, `kimi`, `zai`, `cerebras`, `openrouter`

## Conventions

- Shared contracts only. No API clients, request execution, provider registry, streaming implementations, or model catalogs.
- Minimal shared runtime is allowed only when it is a low-level cross-package primitive, such as `KnownApis`, `isValidApi`, or shared error classes.
- Export all public contracts from `src/index.ts`.
- Use discriminated unions for variant domains such as `Message`, `SessionNode`, `BaseAssistantEvent`, and `AgentEvent`.
- Keep provider option types close to the official SDK params. Only omit fields that are library-managed.
- Use `exactOptionalPropertyTypes`; avoid assigning `undefined` to optional properties.
- Add JSDoc to exported public contracts.

## Adding a New Provider

1. Create `src/providers/<name>.ts` with native response and provider options types
2. Add the provider string to `KnownApis` in `src/api.ts`
3. Add the provider to `ApiNativeResponseMap` and `ApiOptionsMap` in `src/providers/index.ts`
4. Re-export the new provider types from `src/providers/index.ts`
5. Re-export them from `src/index.ts`

The exhaustive `Api` union will surface compile errors anywhere the new provider is not handled.

## Boundaries

**Never:**

- Add provider request logic, SDK clients, or streaming code
- Add model catalogs or runtime dispatch logic
- Use `any` when `unknown` plus narrowing will do
- Remove or reshape public contracts without checking consumers

**Ask first:**

- Changing `Api`
- Changing `Content`, `Message`, `BaseAssistantMessage`, or `BaseAssistantEvent`
- Changing adapter or session contract shapes
- Introducing new runtime exports beyond simple shared primitives

**Freely:**

- Add or refine types
- Add provider type files
- Improve JSDoc and package docs
- Add compile-only validation or type-level regression coverage

## Dependencies

- Runtime dependencies: none
- Dev dependencies: provider SDK packages used only for type extraction
- Depended on by: `@ank1015/llm-core`, `@ank1015/llm-sdk`, `@ank1015/llm-sdk-adapters`
