# Types

## Imports

```ts
import type {
  AgentEvent,
  AgentTool,
  AssistantResponse,
  AssistantToolCall,
  BaseAssistantEvent,
  BaseAssistantMessage,
  BranchInfo,
  Content,
  FileContent,
  FileSessionsAdapter,
  ImageContent,
  InMemorySessionsAdapter,
  ManagedConversationWithFileSessions,
  ManagedConversationWithMemorySessions,
  ManagedConversationWithSessions,
  Message,
  MessageNode,
  Session,
  SessionHeader,
  SessionSummary,
  StopReason,
  TextContent,
  ToolResultMessage,
  Usage,
  UserMessage,
  UseLlmsAssistantEvent,
  UseLlmsAssistantMessage,
  UseLlmsConversation,
  UseLlmsSessionManager,
  UseLlmsStream,
} from '@ank1015/llm-agents';
```

## Common Type Aliases

The helper-specific aliases map to the same normalized runtime types:

```ts
type UseLlmsMessage = Message;
type UseLlmsUserMessage = UserMessage;
type UseLlmsAssistantMessage = BaseAssistantMessage;
type UseLlmsAssistantEvent = BaseAssistantEvent;
```

The remaining helper aliases refer to the main returned objects:

- `UseLlmsStream`
  - the streamed object returned by `streamLlm()`
- `UseLlmsConversation`
  - the stateful conversation object returned by `createManagedConversation()`
- `UseLlmsSessionManager`
  - the session helper returned when `sessions` is enabled

These aliases exist so the skill docs can talk about one stable surface.

## Content Blocks

These are the building blocks inside user messages, tool results, and assistant responses.

```ts
interface TextContent {
  type: 'text';
  content: string;
  metadata?: Record<string, unknown>;
}

interface ImageContent {
  type: 'image';
  data: string;
  mimeType: string;
  metadata?: Record<string, unknown>;
}

interface FileContent {
  type: 'file';
  data: string;
  mimeType: string;
  filename: string;
  metadata?: Record<string, unknown>;
}

type Content = (TextContent | ImageContent | FileContent)[];
```

Read `content` as “an array of blocks,” not “just a string.”

## Message Shapes

`Message` is the normalized conversation unit used by both helpers.

```ts
interface UserMessage {
  role: 'user';
  id: string;
  timestamp?: number;
  content: Content;
}

interface ToolResultMessage<TDetails = unknown> {
  role: 'toolResult';
  id: string;
  toolName: string;
  toolCallId: string;
  content: Content;
  details?: TDetails;
  isError: boolean;
  error?: {
    message: string;
    name?: string;
    stack?: string;
  };
  timestamp: number;
}

interface CustomMessage {
  role: 'custom';
  id: string;
  content: Record<string, unknown>;
  timestamp?: number;
}

type Message = UserMessage | ToolResultMessage | BaseAssistantMessage | CustomMessage;
```

Practical reading order for messages:

- `user`
  - what was asked
- `assistant`
  - what the model replied with
- `toolResult`
  - what a tool returned back into the conversation
- `custom`
  - app-specific records that are not standard chat messages

## Assistant Message Shape

This is the final result you get from `stream.result()`, `stream.drain()`, and the assistant messages inside a conversation history.

```ts
type StopReason = 'stop' | 'length' | 'toolUse' | 'error' | 'aborted';

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

interface AssistantToolCall {
  type: 'toolCall';
  name: string;
  arguments: Record<string, unknown>;
  toolCallId: string;
}

type AssistantResponse =
  | { type: 'response'; content: Content }
  | { type: 'thinking'; thinkingText: string }
  | AssistantToolCall;

interface BaseAssistantMessage {
  role: 'assistant';
  message: unknown;
  api: string;
  id: string;
  model: {
    id: string;
    name: string;
    api: string;
  };
  errorMessage?: string;
  timestamp: number;
  duration: number;
  stopReason: StopReason;
  content: AssistantResponse[];
  usage: Usage;
}
```

Important practical fields:

- `content`
  - normalized response blocks and tool-call blocks
- `stopReason`
  - tells you whether generation ended normally, hit length, requested a tool, errored, or was aborted
- `usage`
  - token and cost data for that assistant turn
- `errorMessage`
  - populated when the assistant message ended in an error-like state

## Happy Path: Extract Text From An Assistant Message

When you want the final plain-text reply, use this pattern:

```ts
function getAssistantText(message: UseLlmsAssistantMessage): string {
  let text = '';

  for (const part of message.content) {
    if (part.type !== 'response') continue;

    for (const block of part.content) {
      if (block.type === 'text') {
        text += block.content;
      }
    }
  }

  return text.trim();
}
```

Why this helper exists:

- `message.content` is not just one text string
- a final assistant message can contain response blocks, thinking blocks, and tool-call blocks
- a response block can contain text, image, or file blocks

So the safe happy path is:

- keep only `part.type === 'response'`
- then keep only `block.type === 'text'`
- join those text blocks together

Use this same helper for:

- the final result from `stream.result()`
- the final result from `stream.drain()`
- assistant messages returned from `conversation.prompt(...)`
- assistant messages stored in `conversation.state.messages`

## Stream Event Shape

`UseLlmsAssistantEvent` is the streamed event type yielded while iterating a `UseLlmsStream`.

```ts
type BaseAssistantEvent =
  | { type: 'start'; message: BaseAssistantMessage }
  | { type: 'text_start'; contentIndex: number; message: BaseAssistantMessage }
  | {
      type: 'text_delta';
      contentIndex: number;
      delta: string;
      message: BaseAssistantMessage;
    }
  | {
      type: 'text_end';
      contentIndex: number;
      content: Content;
      message: BaseAssistantMessage;
    }
  | { type: 'thinking_start'; contentIndex: number; message: BaseAssistantMessage }
  | {
      type: 'thinking_delta';
      contentIndex: number;
      delta: string;
      message: BaseAssistantMessage;
    }
  | {
      type: 'thinking_end';
      contentIndex: number;
      content: string;
      message: BaseAssistantMessage;
    }
  | { type: 'toolcall_start'; contentIndex: number; message: BaseAssistantMessage }
  | {
      type: 'toolcall_delta';
      contentIndex: number;
      delta: string;
      message: BaseAssistantMessage;
    }
  | {
      type: 'toolcall_end';
      contentIndex: number;
      toolCall: AssistantToolCall;
      message: BaseAssistantMessage;
    }
  | { type: 'done'; reason: 'stop' | 'length' | 'toolUse'; message: BaseAssistantMessage }
  | { type: 'error'; reason: 'aborted' | 'error'; message: BaseAssistantMessage };
```

Common event usage patterns:

- use `text_delta` for incremental visible text
- use `toolcall_end` when you need the fully parsed tool call
- use `done` or `error` as the terminal streamed state before reading the final assistant message

## Stream Return Type

`streamLlm()` returns `Promise<UseLlmsStream>`.

```ts
class UseLlmsStream implements AsyncIterable<UseLlmsAssistantEvent> {
  [Symbol.asyncIterator](): AsyncIterator<UseLlmsAssistantEvent>;
  result(): Promise<UseLlmsAssistantMessage>;
  drain(): Promise<UseLlmsAssistantMessage>;
}
```

Use these methods as follows:

- `for await (const event of stream)`
  - consume incremental updates
- `await stream.result()`
  - get the final assistant message after the stream ends
- `await stream.drain()`
  - skip manual event handling and wait for the final assistant message

## Conversation Event Shape

`conversation.subscribe(...)` emits `AgentEvent` values.

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
      message: Message | BaseAssistantEvent;
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
      partialResult: {
        content: Content;
        details: unknown;
      };
    }
  | {
      type: 'tool_execution_end';
      toolCallId: string;
      toolName: string;
      result: {
        content: Content;
        details: unknown;
      };
      isError: boolean;
    }
  | { type: 'turn_end' }
  | { type: 'agent_end'; agentMessages: Message[] };
```

This is the event stream you use for live UI updates during `createManagedConversation(...)` runs.

## Conversation Return Types

`createManagedConversation(...)` returns either a conversation directly or a conversation plus session helpers.

```ts
interface UseLlmsConversation {
  state: {
    systemPrompt?: string;
    provider: {
      model: {
        id: string;
        name: string;
        api: string;
      };
      providerOptions?: Record<string, unknown>;
    };
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
  };

  prompt(...args: unknown[]): Promise<Message[]>;
  promptMessage(...args: unknown[]): Promise<Message[]>;
  continue(...args: unknown[]): Promise<Message[]>;
  subscribe(fn: (event: AgentEvent) => void): () => void;
  abort(): void;
  waitForIdle(): Promise<void>;
}

interface ManagedConversationWithSessions {
  conversation: UseLlmsConversation;
  sessionManager: UseLlmsSessionManager;
  sessionsAdapter: FileSessionsAdapter | InMemorySessionsAdapter;
}

interface ManagedConversationWithFileSessions extends ManagedConversationWithSessions {
  sessionsAdapter: FileSessionsAdapter;
}

interface ManagedConversationWithMemorySessions extends ManagedConversationWithSessions {
  sessionsAdapter: InMemorySessionsAdapter;
}
```

## Session Data Shapes

If you use the returned `sessionManager`, these are the common session objects you will read back:

```ts
interface SessionHeader {
  type: 'session';
  id: string;
  parentId: null;
  branch: 'main';
  timestamp: string;
  sessionName: string;
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

interface MessageNode {
  type: 'message';
  id: string;
  parentId: string | null;
  branch: string;
  timestamp: string;
  message: Message;
  api: string;
  modelId: string;
  providerOptions: Record<string, unknown>;
}

interface Session {
  location: {
    projectName: string;
    path: string;
    sessionId: string;
  };
  header: SessionHeader;
  nodes: Array<SessionHeader | MessageNode | { type: 'custom'; payload: Record<string, unknown> }>;
}

interface BranchInfo {
  name: string;
  branchPointId: string | null;
  nodeCount: number;
  latestNodeId: string;
}
```

## Practical Return Rules

- `streamLlm(...)`
  - returns a stream object, not a final message directly
- `stream.result()` / `stream.drain()`
  - return one final assistant message
- `conversation.prompt(...)`
  - returns only the newly produced messages for that run
- `conversation.state.messages`
  - stores the full accumulated conversation history
- `createManagedConversation({ ..., sessions: 'file' })`
  - returns `{ conversation, sessionManager, sessionsAdapter }` with file-backed session storage
- `createManagedConversation({ ..., sessions: 'memory' })`
  - returns `{ conversation, sessionManager, sessionsAdapter }` with in-memory session storage
