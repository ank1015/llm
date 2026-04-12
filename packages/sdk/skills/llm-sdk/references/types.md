# Types

All types used with `@ank1015/llm-sdk`. Import any of them directly from the SDK:

```ts
import type {
  Message,
  UserMessage,
  ToolResultMessage,
  BaseAssistantMessage,
  AssistantResponse,
  AssistantToolCall,
  Content,
  Tool,
  AgentTool,
  AgentEvent,
  ToolDefinition,
  ToolContext,
  ToolResult,
  CuratedModelId,
  ReasoningEffort,
  LlmInput,
  LlmRun,
  AgentInput,
  AgentRun,
  AgentResult,
  BaseAssistantEvent,
  SessionMessagesLoader,
  SessionNodeSaver,
  ToolResultMessageOptions,
  UserMessageOptions,
  AssistantResponseInput,
  ProviderOptionsForModelId,
  SupportedProviderOptions,
} from '@ank1015/llm-sdk';
```

---

## Messages

### `Message`

The union of all message types passed to `llm()`.

```ts
type Message = UserMessage | ToolResultMessage | BaseAssistantMessage | CustomMessage;
```

In practice you'll author `UserMessage` and `ToolResultMessage`. `BaseAssistantMessage` comes back from `llm()` calls and can be put directly into the history for multi-turn conversations.

The SDK also exports response helpers for the common case:

```ts
import { getText, getThinking, getToolCalls } from '@ank1015/llm-sdk';
```

---

### `UserMessage`

A message from the user.

```ts
interface UserMessage {
  role: 'user';
  id: string; // unique message id
  content: Content; // what the user said (text, image, file)
  timestamp?: number; // Unix ms (optional)
}
```

The easiest way to create a `UserMessage` is with the SDK helper:

```ts
import { userMessage } from '@ank1015/llm-sdk';

const msg = userMessage('Summarize this document.');
```

You can also pass structured content and override the generated `id` or `timestamp`:

```ts
import { userMessage } from '@ank1015/llm-sdk';

const msg = userMessage(
  [
    { type: 'text', content: 'What is in this image?' },
    { type: 'image', data: base64String, mimeType: 'image/jpeg' },
  ],
  { id: 'msg-1', timestamp: Date.now() }
);
```

Example:

```ts
const msg: UserMessage = {
  role: 'user',
  id: 'msg-1',
  content: [{ type: 'text', content: 'Summarize this document.' }],
};
```

Helper signature:

```ts
interface UserMessageOptions {
  id?: string;
  timestamp?: number;
}

declare function userMessage(content: string | Content, options?: UserMessageOptions): UserMessage;
```

---

### `ToolResultMessage`

Represents the result of executing a tool call. Add this to your message history after you handle a tool call from the model.

```ts
interface ToolResultMessage<TDetails = unknown> {
  role: 'toolResult';
  id: string; // unique message id, you provide this
  toolName: string; // name of the tool that was called
  toolCallId: string; // from AssistantToolCall.toolCallId
  content: Content; // what the tool returned
  details?: TDetails; // optional structured data (not sent to model)
  isError: boolean;
  error?: {
    message: string;
    name?: string;
    stack?: string;
  };
  timestamp: number; // Unix ms
}
```

Example — after calling `get_weather`:

```ts
const toolResult: ToolResultMessage = {
  role: 'toolResult',
  id: 'tr-1',
  toolName: 'get_weather',
  toolCallId: toolCall.toolCallId, // from the AssistantToolCall in the response
  content: [{ type: 'text', content: '72°F, sunny' }],
  isError: false,
  timestamp: Date.now(),
};
```

The easiest way to create a `ToolResultMessage` is with the SDK helper:

```ts
import { toolResultMessage } from '@ank1015/llm-sdk';

const message = toolResultMessage({
  toolCall,
  content: [{ type: 'text', content: '72F, sunny' }],
});
```

Helper signature:

```ts
interface ToolResultMessageOptions<TDetails = unknown> {
  toolCall: AssistantToolCall;
  content: Content;
  details?: TDetails;
  isError?: boolean;
  error?: ToolResultMessage<TDetails>['error'];
  id?: string;
  timestamp?: number;
}

declare function toolResultMessage<TDetails = unknown>(
  options: ToolResultMessageOptions<TDetails>
): ToolResultMessage<TDetails>;
```

---

## Content

`Content` is the shared content format used in user messages, tool results, and the model's text output.

```ts
type Content = Array<TextContent | ImageContent | FileContent>;

interface TextContent {
  type: 'text';
  content: string;
  metadata?: Record<string, unknown>;
}

interface ImageContent {
  type: 'image';
  data: string; // base64 encoded
  mimeType: string; // e.g. 'image/jpeg', 'image/png'
  metadata?: Record<string, unknown>;
}

interface FileContent {
  type: 'file';
  data: string; // base64 encoded
  mimeType: string; // e.g. 'application/pdf'
  filename: string;
  metadata?: Record<string, unknown>;
}
```

Examples:

```ts
// Text only
const content: Content = [{ type: 'text', content: 'Hello' }];

// Image attachment
const content: Content = [
  { type: 'text', content: 'What is in this image?' },
  { type: 'image', data: base64String, mimeType: 'image/jpeg' },
];

// PDF file
const content: Content = [
  { type: 'text', content: 'Summarize this document.' },
  { type: 'file', data: base64String, mimeType: 'application/pdf', filename: 'report.pdf' },
];
```

---

## Response helpers

These are small SDK helpers for reading the common parts of a `BaseAssistantMessage` without manually looping through nested arrays.

```ts
type AssistantResponseInput = BaseAssistantMessage | AssistantResponse | null | undefined;

declare function getText(input: AssistantResponseInput): string;
declare function getThinking(input: AssistantResponseInput): string;
declare function getToolCalls(input: AssistantResponseInput): AssistantToolCall[];
```

Examples:

```ts
import { getText, getThinking, getToolCalls } from '@ank1015/llm-sdk';

const message = await llm({ ... });

console.log(getText(message));
console.log(getThinking(message));

for (const toolCall of getToolCalls(message)) {
  console.log(toolCall.name, toolCall.arguments);
}
```

You can also pass `message.content` directly instead of the full `message`.

---

## Tools

### `Tool`

The schema-only definition of a tool — what you pass to `llm()` in the `tools` array so the model knows what tools are available.

```ts
interface Tool {
  name: string;
  description: string;
  parameters: TSchema; // TypeBox schema — describes the tool's arguments
}
```

The model uses `name` and `description` to decide when to call the tool, and `parameters` to structure its arguments.

---

### `tool()` helper + `ToolDefinition`

If you need to both define a tool **and** execute it yourself, use the `tool()` helper. It takes a `ToolDefinition` and returns an object you can use in the `tools` array and also call `.execute()` on.

```ts
import { tool } from '@ank1015/llm-sdk';
import { Type } from '@sinclair/typebox';

const getWeather = tool({
  name: 'get_weather',
  description: 'Get the current weather for a city.',
  parameters: Type.Object({
    city: Type.String({ description: 'City name' }),
  }),
  execute: async (params, context) => {
    // params is typed: { city: string }
    const result = await fetchWeather(params.city);
    return {
      content: [{ type: 'text', content: result }],
    };
  },
});

// Pass to llm():
const message = await llm({
  modelId: 'anthropic/claude-sonnet-4-6',
  messages,
  tools: [getWeather],
});

// Execute when the model calls it:
for (const item of message.content) {
  if (item.type === 'toolCall' && item.name === 'get_weather') {
    const result = await getWeather.execute(item.arguments, { ... });
  }
}
```

Full `ToolDefinition` shape:

```ts
interface ToolDefinition<TParameters, TDetails = unknown, TName extends string = string> {
  name: TName;
  description: string;
  parameters: TParameters; // TypeBox schema
  execute: (
    params: Static<TParameters>, // typed args from the model
    context: ToolContext<TDetails>
  ) => ToolResult<TDetails> | Promise<ToolResult<TDetails>>;
}
```

---

### `ToolContext`

The second argument to `execute`. Gives you access to the message history and a way to stream partial results.

```ts
interface ToolContext<TDetails = unknown> {
  messages: readonly Message[]; // full message history at time of tool call
  toolCallId: string; // the tool call id
  signal?: AbortSignal;
  update: (partialResult: ToolResult<TDetails>) => void | Promise<void>;
  // call update() to stream intermediate results before returning the final one
}
```

---

### `ToolResult`

What your `execute` function returns.

```ts
interface ToolResult<TDetails = unknown> {
  content: Content; // what to send back to the model
  details?: TDetails; // optional structured data stored in ToolResultMessage but not sent to model
}
```

---

## Model IDs — `CuratedModelId`

The full list of supported model IDs:

```ts
type CuratedModelId =
  // OpenAI
  | 'openai/gpt-5.4'
  | 'openai/gpt-5.4-pro'
  | 'openai/gpt-5.4-mini'
  | 'openai/gpt-5.4-nano'
  | 'openai/gpt-5.3-codex'
  // Codex
  | 'codex/gpt-5.4'
  | 'codex/gpt-5.4-mini'
  | 'codex/gpt-5.3-codex'
  | 'codex/gpt-5.3-codex-spark'
  // Anthropic
  | 'anthropic/claude-opus-4-6'
  | 'anthropic/claude-sonnet-4-6'
  // Claude Code
  | 'claude-code/claude-opus-4-6'
  | 'claude-code/claude-sonnet-4-6'
  // Google
  | 'google/gemini-3.1-pro-preview'
  | 'google/gemini-3-flash-preview'
  | 'google/gemini-3.1-flash-lite-preview';
```

---

## `ReasoningEffort`

Controls how much the model reasons before responding (for models that support it).

```ts
type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh';
```

Provider behavior in this SDK:

- `openai` and `codex`: omitted means no standardized reasoning option is added.
- `anthropic` and `claude-code`: adaptive thinking and `cache_control: { type: 'ephemeral' }` are enabled by default for the supported Claude 4.6 models. `ReasoningEffort` adjusts the adaptive effort level.
- `google`: omitted means the provider default thinking behavior is used.

---

## Provider options — `ProviderOptionsForModelId` and `SupportedProviderOptions`

Use `ProviderOptionsForModelId<'...'>` when you want precise provider-specific typing for `overrideProviderSetting`.

```ts
import type { ProviderOptionsForModelId } from '@ank1015/llm-sdk';

// Example: set max tokens for Anthropic
overrideProviderSetting: {
  max_tokens: 1024,
} satisfies Partial<ProviderOptionsForModelId<'anthropic/claude-sonnet-4-6'>>
```

When you call `llm({...})` or `agent({...})` with a literal `modelId`, TypeScript will usually infer the correct provider-specific type for `overrideProviderSetting` automatically.

`SupportedProviderOptions` is still exported as the broad union of all supported provider option types. It is useful for generic utilities, but it is not the best type when you want provider-specific compile-time validation.

---

## Agent types

### `AgentTool`

Executable tool type used by `agent()`. Create them with the SDK `tool()` helper — the return value of `tool(...)` is an `AgentTool`.

```ts
import { tool } from '@ank1015/llm-sdk';
import { Type } from '@sinclair/typebox';

const myTool = tool({
  name: 'my_tool',
  description: '...',
  parameters: Type.Object({ input: Type.String() }),
  execute: async ({ input }) => ({
    content: [{ type: 'text', content: 'done' }],
  }),
});

// Pass to agent():
agent({ tools: [myTool], ... });
```

See the [Tools section above](#tools) for the full `ToolDefinition` shape.

---

### `AgentInput`

Input type for `agent()`.

```ts
type AgentInput<TModelId extends CuratedModelId = CuratedModelId> = {
  modelId: TModelId;
  inputMessages?: Message[];
  system?: string;
  tools?: AgentTool[];
  session?: {
    path?: string;
    branch?: string;
    headId?: string;
    title?: string;
    loadMessages?: SessionMessagesLoader;
    saveNode?: SessionNodeSaver;
  };
  reasoningEffort?: ReasoningEffort;
  overrideProviderSetting?: Partial<ProviderOptionsForModelId<TModelId>>;
  keysFilePath?: string;
  signal?: AbortSignal;
  maxTurns?: number;
};
```

Important: `inputMessages` means the new messages for this run. Previous history comes from the session automatically.

---

### `AgentRun`

The return type of `agent()`.

```ts
interface AgentRun extends AsyncIterable<AgentEvent>, PromiseLike<AgentResult> {
  readonly sessionPath: string;
  drain(): Promise<AgentResult>;
}
```

So you can:

```ts
const result = await agent({ ... });
```

or:

```ts
const run = agent({ ... });
console.log(run.sessionPath);

for await (const event of run) {
  // handle AgentEvent
}

const result = await run;
```

---

### `AgentResult`

The final result of `agent()`.

```ts
type AgentResult =
  | {
      ok: true;
      sessionPath: string;
      sessionId: string;
      branch: string;
      headId: string;
      messages: Message[];
      newMessages: Message[];
      finalAssistantMessage?: BaseAssistantMessage;
      turns: number;
      totalTokens: number;
      totalCost: number;
    }
  | {
      ok: false;
      sessionPath: string;
      sessionId: string;
      branch: string;
      headId?: string;
      messages: Message[];
      newMessages: Message[];
      error: {
        phase: 'session' | 'model' | 'tool' | 'limit' | 'hook' | 'aborted';
        message: string;
        canRetry: boolean;
      };
      turns: number;
      totalTokens: number;
      totalCost: number;
    };
```

`AgentResult` is always a union. `agent()` does not throw for normal run failures.

Setup failures like unsupported model IDs or missing provider credentials throw `AgentInputError` before the run starts.

`messages` is the full branch history after the run.

`newMessages` is only the delta produced during this run.

---

### `AgentEvent`

Streaming event type emitted by `agent()`.

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
      message: Message | BaseAssistantEvent; // BaseAssistantEvent during streaming
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
      partialResult: ToolResult;
    }
  | {
      type: 'tool_execution_end';
      toolCallId: string;
      toolName: string;
      result: ToolResult;
      isError: boolean;
    }
  | { type: 'turn_end' }
  | { type: 'agent_end'; agentMessages: Message[] };
```

---

### `SessionMessagesLoader`

Custom loader for `agent({ session: { loadMessages } })`. Use this when you want to control how the session history is turned into the `Message[]` array the agent sees.

```ts
type SessionMessagesLoader = (context: {
  path: string; // path to the .jsonl session file
  branch: string; // branch name being loaded
  session: {
    path: string;
    header: { type: 'session'; version: 1; id: string; createdAt: string; title?: string };
    nodes: SessionNode[];
  };
  head: SessionNode | typeof session.header; // the most recent node on the branch
  lineage: {
    path: string;
    sessionId: string;
    branch: string;
    head: SessionNode | typeof session.header;
    entries: (typeof session.header | SessionNode)[];
    nodes: SessionNode[];
  };
}) => Message[] | Promise<Message[]>;
```

If you don't provide `loadMessages`, the SDK loads messages from the lineage automatically.

---

### `SessionNodeSaver`

Custom saver for `agent({ session: { saveNode } })`. Use this when you want custom persistence (e.g. a database) instead of the default JSONL file append.

```ts
type SessionNodeSaver = (context: {
  path: string; // path to the .jsonl session file
  session: {
    path: string;
    header: { type: 'session'; version: 1; id: string; createdAt: string; title?: string };
    nodes: SessionNode[];
  };
  node: SessionNode; // the node being saved
}) => void | Promise<void>;

// SessionNode is one of:
type SessionNode =
  | {
      type: 'message';
      id: string;
      parentId: string;
      branch: string;
      timestamp: string;
      message: Message;
    }
  | {
      type: 'custom';
      id: string;
      parentId: string;
      branch: string;
      timestamp: string;
      name: string;
      payload: unknown;
    };
```

If you don't provide `saveNode`, messages are appended to the JSONL file automatically.
