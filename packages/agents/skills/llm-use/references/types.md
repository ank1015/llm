# Type Map

Use this reference when the task is mostly about the public SDK type shapes rather than runtime wiring.

## Contents

- [Import Types From The Public SDK](#import-types-from-the-public-sdk)
- [Core Chat and Call Types](#core-chat-and-call-types)
- [Conversation and Agent Types](#conversation-and-agent-types)
- [Session Types](#session-types)
- [Practical Rule](#practical-rule)

## Import Types From The Public SDK

```ts
import type {
  AgentEvent,
  AgentTool,
  AgentToolResult,
  AssistantResponse,
  AssistantToolCall,
  Attachment,
  BaseAssistantMessage,
  Context,
  CustomNode,
  Message,
  MessageNode,
  Model,
  Provider,
  Session,
  SessionLocation,
  SessionNode,
  UserMessage,
} from '@ank1015/llm-sdk';
```

## Core Chat and Call Types

### `Model<TApi>`

Use this for the selected provider/model definition returned by `getModel(...)`.

What matters in application code:

- `api`
- `id`
- `name`
- context and token limits
- tool support metadata

### `Provider<TApi>`

Use this when configuring `Conversation`.

What it carries:

- `model`
- optional `providerOptions`

For this skill, normal task code should keep provider options minimal and rely on `keysAdapter`.

### `Context`

Use this as the input to `complete()` or `stream()`.

What it usually contains:

- `messages`
- optional `systemPrompt`
- optional `tools`

### `Message`

This is the shared union used across the SDK for normal application code.

Common message roles:

- `user`
- `assistant`
- `toolResult`
- `custom`

### `UserMessage`

Use this when you need an explicitly typed user-authored message in code.

What matters:

- `role: 'user'`
- `id`
- `content`
- optional `timestamp`

### `BaseAssistantMessage<TApi>`

This is the final assistant output type returned by `complete()` or `stream().result()`.

What matters most:

- `api`
- `model`
- `stopReason`
- normalized `content`
- `usage`
- provider-native `message`

Normal application code should usually read the normalized `content` first and only fall back to the provider-native `message` when the task explicitly requires provider-specific fields.

### `AssistantResponse`

This is the normalized assistant content array stored on `BaseAssistantMessage.content`.

It can contain:

- `response` blocks
- `thinking` blocks
- `toolCall` blocks

### `AssistantToolCall`

Use this when the task needs to inspect tool-call content inside an assistant response.

What matters:

- `name`
- `arguments`
- `toolCallId`

## Conversation and Agent Types

### `AgentTool`

Use this to define tools passed into `Conversation.setTools(...)`.

What matters:

- `name`
- `label`
- `description`
- `parameters` as a TypeBox schema value
- `execute(...)`

### `AgentToolResult<T>`

This is the tool execution result shape returned from `AgentTool.execute(...)`.

What matters:

- `content`
- `details`

### `AgentEvent`

Use this for `Conversation.subscribe(...)`.

Typical cases in app code:

- assistant stream updates
- tool execution lifecycle events
- message lifecycle events

### `Attachment`

Use this when `Conversation.prompt(...)` needs user-supplied file or image inputs.

What matters:

- `type`
- `fileName`
- `mimeType`
- `content`

## Session Types

### `SessionLocation`

Use this when you need to identify a stored session by project, path, and id.

### `Session`

Use this for a fully loaded session:

- `location`
- `header`
- `nodes`

### `SessionNode`

This is the stored node union in a session tree.

Most app code only needs to distinguish:

- header node
- message node
- custom node

### `MessageNode`

This is the most useful session node type for replaying or hydrating a conversation.

What matters:

- `message`
- `api`
- `modelId`
- `parentId`
- `branch`

### `CustomNode`

Use this when the task stores application-specific metadata in the session tree.

What matters:

- `payload`
- `parentId`
- `branch`

## Practical Rule

When the task is normal application code:

- runtime values and app-facing types should come from `@ank1015/llm-sdk`
- concrete adapter implementations should come from `@ank1015/llm-sdk-adapters`
- avoid importing internal types from package source paths or from `@ank1015/llm-core`
