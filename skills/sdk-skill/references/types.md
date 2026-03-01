# Types Reference

All types are exported from `@ank1015/llm-sdk`. Implementations come from `@ank1015/llm-types`.

## Table of Contents

- [Messages](#messages)
- [Content](#content)
- [Assistant Response](#assistant-response)
- [Usage](#usage)
- [Tools](#tools)
- [Agent Types](#agent-types)
- [Agent Events](#agent-events)
- [Session Types](#session-types)
- [Adapter Interfaces](#adapter-interfaces)
- [Provider Options](#provider-options)
- [Errors](#errors)

## Messages

```ts
type Message = UserMessage | ToolResultMessage | BaseAssistantMessage<Api> | CustomMessage;
```

### UserMessage

```ts
interface UserMessage {
  role: 'user';
  id: string;
  timestamp?: number;
  content: Content; // text, images, files
}
```

### BaseAssistantMessage

```ts
interface BaseAssistantMessage<TApi extends Api> {
  role: 'assistant';
  id: string;
  api: TApi;
  model: Model<TApi>;
  message: NativeResponseForApi<TApi>; // raw provider response
  timestamp: number;
  duration: number; // ms
  stopReason: StopReason;
  content: AssistantResponse; // normalized content
  usage: Usage;
  errorMessage?: string;
}

type StopReason = 'stop' | 'length' | 'toolUse' | 'error' | 'aborted';
```

### ToolResultMessage

```ts
interface ToolResultMessage<TDetails = unknown> {
  role: 'toolResult';
  id: string;
  toolName: string;
  toolCallId: string;
  content: Content;
  details?: TDetails;
  isError: boolean;
  error?: { message: string; name?: string; stack?: string };
  timestamp: number;
}
```

### CustomMessage

```ts
interface CustomMessage {
  role: 'custom';
  id: string;
  content: Record<string, unknown>; // arbitrary data
  timestamp?: number;
}
```

## Content

```ts
type Content = (TextContent | ImageContent | FileContent)[];

interface TextContent {
  type: 'text';
  content: string;
  metadata?: Record<string, unknown>;
}

interface ImageContent {
  type: 'image';
  data: string; // base64
  mimeType: string; // e.g. "image/png"
  metadata?: Record<string, unknown>;
}

interface FileContent {
  type: 'file';
  data: string; // base64
  mimeType: string; // e.g. "application/pdf"
  filename: string;
  metadata?: Record<string, unknown>;
}
```

## Assistant Response

The normalized content of an assistant message:

```ts
type AssistantResponse = (
  | AssistantResponseContent
  | AssistantThinkingContent
  | AssistantToolCall
)[];

interface AssistantResponseContent {
  type: 'response';
  content: Content;
}

interface AssistantThinkingContent {
  type: 'thinking';
  thinkingText: string;
}

interface AssistantToolCall {
  type: 'toolCall';
  name: string;
  arguments: Record<string, unknown>;
  toolCallId: string;
}
```

## Usage

```ts
interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
}
```

## Tools

### Tool (schema only — for Context)

```ts
interface Tool<TParameters extends TSchema = TSchema> {
  name: string;
  description: string;
  parameters: TParameters; // TypeBox schema
}
```

### AgentTool (with execute — for Conversation)

```ts
interface AgentTool<
  TParameters extends TSchema = TSchema,
  TDetails = unknown,
> extends Tool<TParameters> {
  label: string; // human-readable UI label
  execute: (
    toolCallId: string,
    params: Static<TParameters>,
    signal?: AbortSignal,
    onUpdate?: AgentToolUpdateCallback<TDetails>,
    context?: ToolExecutionContext
  ) => Promise<AgentToolResult<TDetails>>;
}

interface AgentToolResult<T> {
  content: Content; // sent back to model
  details: T; // for UI/logging only
}

type AgentToolUpdateCallback<T = unknown> = (partialResult: AgentToolResult<T>) => void;

interface ToolExecutionContext {
  messages: readonly Message[]; // read-only history
}
```

### Attachment (for prompt input)

```ts
interface Attachment {
  id: string;
  type: 'image' | 'file';
  fileName: string;
  mimeType: string;
  size?: number;
  content: string; // base64 (no data URL prefix)
}
```

## Agent Types

### AgentState

```ts
interface AgentState {
  systemPrompt?: string;
  provider: Provider<Api>;
  messages: Message[];
  tools: AgentTool[];
  isStreaming: boolean;
  pendingToolCalls: Set<string>;
  error?: string;
  usage: {
    totalTokens: number;
    totalCost: number;
    lastInputTokens: number;
  };
  costLimit?: number;
  contextLimit?: number;
}
```

### QueuedMessage

```ts
interface QueuedMessage<TApp = Message> {
  original: TApp; // for UI events
  llm?: Message; // transformed for LLM context (undefined if filtered out)
}
```

### Context (for complete/stream)

```ts
interface Context {
  messages: Message[];
  systemPrompt?: string;
  tools?: Tool[];
}
```

## Agent Events

```ts
type AgentEvent =
  | { type: 'agent_start' }
  | { type: 'turn_start' }
  | {
      type: 'message_start';
      messageType: 'user' | 'assistant' | 'toolResult' | 'custom';
      messageId: string;
      message: Message;
    }
  | {
      type: 'message_update';
      messageType: 'assistant' | 'custom';
      messageId: string;
      message: Message | BaseAssistantEvent<Api>;
    }
  | {
      type: 'message_end';
      messageType: 'user' | 'assistant' | 'toolResult' | 'custom';
      messageId: string;
      message: Message;
    }
  | { type: 'tool_execution_start'; toolCallId: string; toolName: string; args: unknown }
  | {
      type: 'tool_execution_update';
      toolCallId: string;
      toolName: string;
      args: unknown;
      partialResult: AgentToolResult<unknown>;
    }
  | {
      type: 'tool_execution_end';
      toolCallId: string;
      toolName: string;
      result: AgentToolResult<unknown>;
      isError: boolean;
    }
  | { type: 'turn_end' }
  | { type: 'agent_end'; agentMessages: Message[] };
```

### BaseAssistantEvent (streaming deltas)

Received during `message_update` for assistant messages:

```ts
type BaseAssistantEvent<TApi extends Api> =
  | { type: 'start'; message: BaseAssistantMessage<TApi> }
  | { type: 'text_start'; contentIndex: number; message: ... }
  | { type: 'text_delta'; contentIndex: number; delta: string; message: ... }
  | { type: 'text_end'; contentIndex: number; content: Content; message: ... }
  | { type: 'thinking_start'; contentIndex: number; message: ... }
  | { type: 'thinking_delta'; contentIndex: number; delta: string; message: ... }
  | { type: 'thinking_end'; contentIndex: number; content: string; message: ... }
  | { type: 'toolcall_start'; contentIndex: number; message: ... }
  | { type: 'toolcall_delta'; contentIndex: number; delta: string; message: ... }
  | { type: 'toolcall_end'; contentIndex: number; toolCall: AssistantToolCall; message: ... }
  | { type: 'done'; reason: 'stop' | 'length' | 'toolUse'; message: ... }
  | { type: 'error'; reason: 'aborted' | 'error'; message: ... };
```

## Session Types

### SessionNode

```ts
type SessionNode = SessionHeader | MessageNode | CustomNode;

interface BaseNode {
  type: string;
  id: string;
  parentId: string | null;
  branch: string;
  timestamp: string; // ISO 8601
}

interface SessionHeader extends BaseNode {
  type: 'session';
  sessionName: string;
  parentId: null;
  branch: 'main';
}

interface MessageNode extends BaseNode {
  type: 'message';
  message: Message;
  api: Api;
  modelId: string;
  providerOptions: Record<string, unknown>;
}

interface CustomNode extends BaseNode {
  type: 'custom';
  payload: Record<string, unknown>;
}
```

### Session & Summary

```ts
interface Session {
  location: SessionLocation;
  header: SessionHeader;
  nodes: SessionNode[];
}

interface SessionLocation {
  projectName: string;
  path: string;
  sessionId: string;
}

interface SessionSummary {
  sessionId: string;
  sessionName: string;
  filePath: string;
  createdAt: string;
  updatedAt: string;
  nodeCount: number;
  branches: string[];
}

interface BranchInfo {
  name: string;
  branchPointId: string | null;
  nodeCount: number;
  latestNodeId: string;
}
```

### Session Input Types

```ts
interface CreateSessionInput {
  projectName: string;
  path?: string;
  sessionName?: string;
}

interface AppendMessageInput {
  projectName: string;
  path: string;
  sessionId?: string; // omit to auto-create
  parentId: string;
  branch: string;
  message: Message;
  api: Api;
  modelId: string;
  providerOptions?: Record<string, unknown>;
}

interface AppendCustomInput {
  projectName: string;
  path: string;
  sessionId: string;
  parentId: string;
  branch: string;
  payload: Record<string, unknown>;
}
```

## Adapter Interfaces

See [adapters.md](adapters.md) for full details and implementations.

```ts
interface KeysAdapter {
  get(api: Api): Promise<string | undefined>;
  getCredentials?(api: Api): Promise<Record<string, string> | undefined>;
  set(api: Api, key: string): Promise<void>;
  setCredentials?(api: Api, credentials: Record<string, string>): Promise<void>;
  delete(api: Api): Promise<boolean>;
  list(): Promise<Api[]>;
}

interface UsageAdapter {
  track<TApi extends Api>(message: BaseAssistantMessage<TApi>): Promise<void>;
  getStats(filters?: UsageFilters): Promise<UsageStats>;
  getMessage<TApi extends Api>(id: string): Promise<BaseAssistantMessage<TApi> | undefined>;
  getMessages<TApi extends Api>(filters?: UsageFilters): Promise<BaseAssistantMessage<TApi>[]>;
  deleteMessage(id: string): Promise<boolean>;
}

interface SessionsAdapter {
  /* see sessions.md */
}
```

## Provider Options

Each `Api` maps to a specific options type via `OptionsForApi<TApi>`:

```ts
type OptionsForApi<TApi extends Api> = ApiOptionsMap[TApi];
```

All options include `apiKey: string` and `signal?: AbortSignal`. Provider-specific extras:

| Provider    | Base                              | Notable Options                           |
| ----------- | --------------------------------- | ----------------------------------------- |
| anthropic   | Anthropic MessageCreateParams     | `max_tokens?`                             |
| openai      | OpenAI ResponseCreateParams       | —                                         |
| google      | Google GenerateContentConfig      | `thinkingConfig?`                         |
| deepseek    | OpenAI ChatCompletionCreateParams | —                                         |
| zai         | OpenAI ChatCompletionCreateParams | `thinking?: { type, clear_thinking? }`    |
| kimi        | OpenAI ChatCompletionCreateParams | `thinking?: { type }`                     |
| codex       | OpenAI ResponseCreateParams       | `chatgpt-account-id`, `instructions?`     |
| claude-code | Anthropic MessageCreateParams     | `oauthToken`, `betaFlag`, `billingHeader` |
| minimax     | Anthropic MessageCreateParams     | `max_tokens?`                             |
| cerebras    | OpenAI ChatCompletionCreateParams | `reasoning_format?`, `reasoning_effort?`  |
| openrouter  | OpenAI ChatCompletionCreateParams | —                                         |

## Errors

All extend `LLMError` which extends `Error`:

```ts
class LLMError extends Error {
  readonly code: LLMErrorCode;
}

type LLMErrorCode =
  | 'API_KEY_NOT_FOUND'
  | 'COST_LIMIT'
  | 'CONTEXT_LIMIT'
  | 'CONVERSATION_BUSY'
  | 'MODEL_NOT_CONFIGURED'
  | 'SESSION_NOT_FOUND'
  | 'INVALID_PARENT'
  | 'PATH_TRAVERSAL';
```

| Error Class               | Code                   | Thrown When                               |
| ------------------------- | ---------------------- | ----------------------------------------- |
| `ApiKeyNotFoundError`     | `API_KEY_NOT_FOUND`    | Credentials missing for provider          |
| `CostLimitError`          | `COST_LIMIT`           | Cost limit exceeded                       |
| `ContextLimitError`       | `CONTEXT_LIMIT`        | Input tokens exceed limit                 |
| `ConversationBusyError`   | `CONVERSATION_BUSY`    | `prompt()` called while already streaming |
| `ModelNotConfiguredError` | `MODEL_NOT_CONFIGURED` | `prompt()` called without `setProvider()` |
