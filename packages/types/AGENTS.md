# @ank1015/llm-types

Shared type definitions for the LLM SDK.

## Commands

- `pnpm build` — Compile TypeScript to dist/
- `pnpm dev` — Watch mode compilation
- `pnpm typecheck` — Type-check without emitting

## Structure

```
src/
  index.ts          — Public exports
  api.ts            — API provider identifiers (Api, KnownApis)
  content.ts        — Content types (TextContent, ImageContent, FileContent)
  message.ts        — Message types (UserMessage, BaseAssistantMessage, etc.)
  model.ts          — Model and Provider types
  tool.ts           — Tool definition and Context types
  request.ts        — API request types (MessageRequest)
  errors.ts         — Error types and classes (LLMError, etc.)
  agent-types.ts    — Agent types (AgentTool, AgentState, AgentEvent, etc.)
  providers/        — Provider-specific types
    index.ts        — Re-exports and type maps
    anthropic.ts    — Anthropic types
    openai.ts       — OpenAI types
    google.ts       — Google/Gemini types
    deepseek.ts     — DeepSeek types
    kimi.ts         — Kimi types
    zai.ts          — Z.AI types
```

## Key Types

### Core Types
- `Api` — Union of supported providers: "openai" | "google" | "deepseek" | "anthropic" | "zai" | "kimi"
- `Content` — Array of TextContent | ImageContent | FileContent
- `Message` — Union of UserMessage | ToolResultMessage | BaseAssistantMessage | CustomMessage
- `Model<TApi>` — Generic model definition with provider-specific typing
- `Provider<TApi>` — Provider configuration (model + options)
- `Tool` — Tool definition with TypeBox schema parameters
- `Context` — Conversation context (messages, systemPrompt, tools)
- `MessageRequest` — Request body for /messages endpoints

### Agent Types
- `AgentTool` — Tool definition with execute function for agent execution
- `AgentToolResult<T>` — Tool execution result with content and details
- `AgentState` — Agent state (messages, tools, provider, usage, limits)
- `AgentLoopConfig` — Configuration for agent loop execution
- `AgentEvent` — Events emitted during agent execution (turn_start, message_start, tool_execution_*, etc.)
- `Attachment` — File/image attachment for user messages
- `QueuedMessage<T>` — Message queued for injection at next turn
- `ToolExecutionContext` — Context provided to tools during execution

### Error Types
- `LLMError` — Base error class with code, message, and status code
- `LLMErrorCode` — Error codes (API_KEY_NOT_FOUND, MODEL_NOT_FOUND, etc.)

## Conventions

- Types only — No runtime code (except `KnownApis`, `isValidApi`, and error classes)
- Export all public types from `src/index.ts`
- Use discriminated unions for variant types
- Use JSDoc comments on all exports
- Provider types extend/omit from official SDK types
- Error classes extend `LLMError` base class
- Agent types use `exactOptionalPropertyTypes` — don't assign undefined to optional properties

## Dependencies

- Depends on: (none — uses SDK types as devDependencies)
- Depended on by: @ank1015/llm-core, @ank1015/llm-sdk
