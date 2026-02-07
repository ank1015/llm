# @ank1015/llm-types

Shared type definitions for the LLM SDK monorepo. Types-only package (no runtime logic except `KnownApis`, `isValidApi`, and error classes).

## Commands

- `pnpm build` — Compile TypeScript to dist/
- `pnpm dev` — Watch mode compilation
- `pnpm typecheck` — Type-check without emitting

## Structure

```
src/
  index.ts          — Public barrel (all exports)
  api.ts            — Api union type, KnownApis array, isValidApi guard
  content.ts        — TextContent, ImageContent, FileContent, Content
  message.ts        — Messages, assistant response types, streaming events
  model.ts          — Model<TApi>, Provider<TApi>
  tool.ts           — Tool definition (TypeBox), Context
  errors.ts         — LLMError hierarchy (8 error classes)
  agent-types.ts    — AgentTool, AgentEvent, AgentState, AgentLoopConfig
  adapters.ts       — KeysAdapter, UsageAdapter, SessionsAdapter interfaces
  session.ts        — Session tree types (JSONL append-only storage)
  providers/
    index.ts        — Type maps (ApiNativeResponseMap, ApiOptionsMap) + re-exports
    anthropic.ts    — AnthropicNativeResponse, AnthropicProviderOptions
    openai.ts       — OpenAINativeResponse, OpenAIProviderOptions
    google.ts       — GoogleNativeResponse, GoogleProviderOptions
    deepseek.ts     — DeepSeekNativeResponse, DeepSeekProviderOptions
    kimi.ts         — KimiNativeResponse, KimiProviderOptions, KimiThinkingConfig
    zai.ts          — ZaiNativeResponse, ZaiProviderOptions, ZaiThinkingConfig
    claude-code.ts  — ClaudeCodeNativeResponse, ClaudeCodeProviderOptions
    codex.ts        — CodexNativeResponse, CodexProviderOptions
```

## Key Types

### Core

- `Api` — Union of known providers: `'openai' | 'codex' | 'google' | 'deepseek' | 'anthropic' | 'claude-code' | 'zai' | 'kimi'`
- `Content` — Array of `TextContent | ImageContent | FileContent`
- `Message` — `UserMessage | ToolResultMessage | BaseAssistantMessage<Api> | CustomMessage`
- `BaseAssistantMessage<TApi>` — Assistant response with normalized `content` + native `message`
- `BaseAssistantEvent<TApi>` — Discriminated union of streaming events (start, text_delta, toolcall_end, done, error, etc.)
- `Model<TApi>` — Model definition (id, api, baseUrl, cost, contextWindow, maxTokens, headers, tools, etc.)
- `Provider<TApi>` — Model + provider options pair
- `Tool` — Tool definition with TypeBox schema for parameters
- `Context` — Conversation context (messages, systemPrompt, tools)
- `Usage` — Token counts + cost breakdown in USD
- `StopReason` — `'stop' | 'length' | 'toolUse' | 'error' | 'aborted'`

### Provider Type Maps

- `ApiNativeResponseMap` — Maps each `Api` to its native SDK response type
- `NativeResponseForApi<TApi>` — Lookup helper for native response
- `ApiOptionsMap` — Maps each `Api` to its provider options type
- `OptionsForApi<TApi>` — Lookup helper for options
- `WithOptionalKey<T>` — Makes `apiKey` optional (for SDK/agent boundaries)

### Adapters

- `KeysAdapter` — API key and multi-credential storage (get/set/delete + getCredentials/setCredentials/deleteCredentials for providers like claude-code)
- `UsageAdapter` — Usage tracking (track, getStats, getMessage, getMessages, deleteMessage)
- `SessionsAdapter` — Session CRUD, branching, history, search
- `UsageFilters`, `UsageStats`, `TokenBreakdown`, `CostBreakdown` — Supporting types for usage queries

### Errors

- `LLMError` — Base error class with `code: LLMErrorCode`
- `ApiKeyNotFoundError` — API key not found for a provider
- `CostLimitError` — Cost budget exceeded
- `ContextLimitError` — Context window exceeded
- `ConversationBusyError` — Concurrent prompt attempted
- `ModelNotConfiguredError` — No provider set before prompt
- `SessionNotFoundError` — Session lookup failed
- `InvalidParentError` — Invalid parent node in session tree
- `PathTraversalError` — Path contains traversal characters

### Agent

- `AgentTool` — Extends `Tool` with `execute` function and `label`
- `AgentToolResult<T>` — Tool execution result (content + details)
- `AgentState` — Full agent state (messages, tools, provider, usage, limits)
- `AgentLoopConfig` — Config for agent loop (systemPrompt, tools, provider, budget)
- `AgentEvent` — Discriminated union of agent lifecycle events
- `Attachment` — File/image attachment for user messages
- `QueuedMessage<T>` — Message queued for injection at next turn
- `ToolExecutionContext` — Read-only conversation history for tools

### Session

- `BaseNode` — Base for all session nodes (id, parentId, branch, timestamp)
- `SessionHeader` — Root node (type: 'session', sessionName)
- `MessageNode` — Conversation message node (type: 'message')
- `CustomNode` — Application-specific data node (type: 'custom')
- `SessionNode` — Union of all node types
- `AppendableNode` — Nodes that can be appended (excludes header)
- `SessionLocation` — Project/path/sessionId identifier
- `Session` — Full session with location, header, and nodes
- `SessionSummary` — Metadata for listing sessions
- `BranchInfo` — Branch metadata (name, branchPointId, nodeCount)
- `CreateSessionInput`, `AppendMessageInput`, `AppendCustomInput`, `UpdateSessionNameInput` — Service input types

## Conventions

- Types only — No runtime code except `KnownApis` array, `isValidApi` guard, and error classes
- Export all public types from `src/index.ts`
- Use discriminated unions for variant types (`Message`, `SessionNode`, `BaseAssistantEvent`, `AgentEvent`)
- Provider types extend/omit from official SDK types — preserving full provider options
- Use `exactOptionalPropertyTypes` — don't assign `undefined` to optional properties
- JSDoc on all exports

## Adding a New Provider

1. Create `providers/<name>.ts` with `NativeResponse` and `ProviderOptions` types
2. Import and re-export from `providers/index.ts`
3. Add to both `ApiNativeResponseMap` and `ApiOptionsMap`
4. Add provider string to `KnownApis` in `api.ts`
5. Re-export new types from `src/index.ts`

The exhaustive `Api` union will cause compile errors wherever a switch/map doesn't handle the new provider.

## Boundaries

**Never:**

- Add runtime logic (this is a types package)
- Use `any` — use `unknown` and narrow
- Remove types that other packages depend on without checking consumers

**Ask first:**

- Changing `BaseAssistantMessage` or `BaseAssistantEvent` shape (affects all providers)
- Adding fields to `Api` union (triggers exhaustiveness errors across the codebase)

**Freely:**

- Add new types
- Add JSDoc to existing types
- Add new provider type files

## Dependencies

- Depends on: none (SDK types are devDependencies for type extraction only)
- Depended on by: `@ank1015/llm-core`, `@ank1015/llm-sdk`
