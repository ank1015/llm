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

- `Api` — Union of supported providers: "openai" | "google" | "deepseek" | "anthropic" | "zai" | "kimi"
- `Content` — Array of TextContent | ImageContent | FileContent
- `Message` — Union of UserMessage | ToolResultMessage | BaseAssistantMessage | CustomMessage
- `Model<TApi>` — Generic model definition with provider-specific typing
- `Tool` — Tool definition with TypeBox schema parameters
- `MessageRequest` — Request body for /messages endpoints
- `LLMError` — Base error class with code, message, and status code
- `LLMErrorCode` — Error codes (API_KEY_NOT_FOUND, MODEL_NOT_FOUND, etc.)

## Conventions

- Types only — No runtime code (except `KnownApis`, `isValidApi`, and error classes)
- Export all public types from `src/index.ts`
- Use discriminated unions for variant types
- Use JSDoc comments on all exports
- Provider types extend/omit from official SDK types
- Error classes extend `LLMError` base class

## Dependencies

- Depends on: (none — uses SDK types as devDependencies)
- Depended on by: @ank1015/llm-core
