# Skill: @ank1015/llm-sdk

A multi-provider LLM SDK. Two main functions: `llm()` for single model calls, `agent()` for stateful multi-turn runs with tool execution and session persistence.

## Setup

API keys are read from `~/.llm-sdk/keys.env`:

```env
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
```

This is user's keystore and contains most of the api keys. You dont need to take care of api keys until the user specifically asks to pass one. In that case you pass your own keystore.env path.

## Import

```ts
import {
  llm, agent, tool,
  userMessage, toolResultMessage,
  getText, getThinking, getToolCalls,
  LlmInputError, AgentInputError,
} from '@ank1015/llm-sdk';
import { Type } from '@sinclair/typebox'; // for tool parameter schemas
```

---

## Supported models

```ts
type CuratedModelId =
  | 'openai/gpt-5.4'
  | 'openai/gpt-5.4-pro'
  | 'openai/gpt-5.4-mini'
  | 'openai/gpt-5.4-nano'
  | 'openai/gpt-5.3-codex'
  | 'codex/gpt-5.4'
  | 'codex/gpt-5.4-mini'
  | 'codex/gpt-5.3-codex'
  | 'codex/gpt-5.3-codex-spark'
  | 'anthropic/claude-opus-4-6'
  | 'anthropic/claude-sonnet-4-6'
  | 'claude-code/claude-opus-4-6'
  | 'claude-code/claude-sonnet-4-6'
  | 'google/gemini-3.1-pro-preview'
  | 'google/gemini-3-flash-preview'
  | 'google/gemini-3.1-flash-lite-preview';
```

---

## `llm()` — single model call

Use when you want one request/response with no tool execution or session.

```ts
function llm(input: LlmInput): LlmRun
```

### Input

```ts
type LlmInput = {
  modelId: CuratedModelId;                              // required
  messages: Message[];                                   // required — the conversation
  system?: string;                                       // system prompt
  tools?: Tool[];                                        // tools the model may call (not executed)
  reasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh'; // for thinking-capable models
  overrideProviderSetting?: Partial<ProviderOptionsForModelId<TModelId>>;
  signal?: AbortSignal;
  requestId?: string;                                    // id for the assistant message
};
```

### Return value

```ts
interface LlmRun extends AsyncIterable<BaseAssistantEvent>, PromiseLike<BaseAssistantMessage> {
  drain(): Promise<BaseAssistantMessage>;
}
```

Two valid usage patterns — pick one, do not mix:

```ts
// Pattern 1: await the final message
const message = await llm({ modelId, messages });

// Pattern 2: stream events, then await the final message after the loop
const run = llm({ modelId, messages });
for await (const event of run) { /* handle events */ }
const message = await run;
```

### Example — simple call

```ts
import { llm, userMessage, getText } from '@ank1015/llm-sdk';

const message = await llm({
  modelId: 'anthropic/claude-sonnet-4-6',
  messages: [userMessage('What is 2 + 2?')],
});

console.log(getText(message)); // "4"
```

### Example — streaming

```ts
const run = llm({
  modelId: 'openai/gpt-5.4-mini',
  messages: [userMessage('Write a haiku about clouds.')],
});

for await (const event of run) {
  if (event.type === 'text_delta') process.stdout.write(event.delta);
}

const message = await run;
console.log(message.usage.cost.total); // USD cost
```

### Example — with tools (manual loop)

```ts
import { llm, userMessage, toolResultMessage, getToolCalls, getText } from '@ank1015/llm-sdk';
import { Type } from '@sinclair/typebox';

const weatherTool: Tool = {
  name: 'get_weather',
  description: 'Get the current weather for a city.',
  parameters: Type.Object({ city: Type.String() }),
};

let messages: Message[] = [userMessage('What is the weather in Tokyo?')];

while (true) {
  const message = await llm({
    modelId: 'anthropic/claude-sonnet-4-6',
    messages,
    tools: [weatherTool],
  });

  messages = [...messages, message];

  const toolCalls = getToolCalls(message);
  if (toolCalls.length === 0) {
    console.log(getText(message));
    break;
  }

  for (const toolCall of toolCalls) {
    const result = await executeWeather(toolCall.arguments.city);
    messages = [...messages, toolResultMessage({ toolCall, content: [{ type: 'text', content: result }] })];
  }
}
```

---

## `agent()` — stateful multi-turn run

Use when you want the model to run multiple turns, execute tools automatically, and persist the conversation to a session file.

```ts
function agent(input: AgentInput): AgentRun
```

### Input

```ts
type AgentInput = {
  modelId: CuratedModelId;                              // required
  inputMessages?: Message[];                             // new messages for this run
  system?: string;                                       // system prompt
  tools?: AgentTool[];                                   // tools the agent will execute
  session?: {
    path?: string;    // path to session .jsonl file (auto-generated if omitted)
    branch?: string;  // branch to continue, default 'main'
    headId?: string;  // specific node to resume from
    title?: string;   // title for a newly-created session
    loadMessages?: SessionMessagesLoader;  // custom history loader
    saveNode?: SessionNodeSaver;           // custom persistence
  };
  reasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh';
  overrideProviderSetting?: Partial<ProviderOptionsForModelId<TModelId>>;
  signal?: AbortSignal;
  maxTurns?: number;  // default 20
};
```

`inputMessages` is the new input for this run only. Prior history is loaded from the session automatically.

### Return value

```ts
interface AgentRun extends AsyncIterable<AgentEvent>, PromiseLike<AgentResult> {
  readonly sessionPath: string;  // available immediately, before the run finishes
  drain(): Promise<AgentResult>;
}
```

`sessionPath` is available on the run object right away — even if the SDK auto-generated it.

Two valid usage patterns — pick one, do not mix:

```ts
// Pattern 1: await the final result
const result = await agent({ modelId, inputMessages, tools });

// Pattern 2: stream events, then await after the loop
const run = agent({ modelId, inputMessages, tools });
console.log(run.sessionPath); // know the path before waiting for completion
for await (const event of run) { /* handle events */ }
const result = await run;
```

### Result

```ts
type AgentResult =
  | {
      ok: true;
      sessionPath: string;
      sessionId: string;
      branch: string;
      headId: string;
      messages: Message[];           // full history including this run
      newMessages: Message[];        // only messages produced in this run
      finalAssistantMessage?: BaseAssistantMessage;
      turns: number;
      totalTokens: number;
      totalCost: number;             // USD
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

`agent()` does not throw for normal run failures — check `result.ok`. Setup failures (bad model ID, missing credentials) throw `AgentInputError`.

`messages` = full branch history after the run (includes session history + inputMessages + this run's output).
`newMessages` = only the delta produced in this run (assistant messages + tool results).

### Example — simple agent run

```ts
import { agent, userMessage, getText } from '@ank1015/llm-sdk';

const result = await agent({
  modelId: 'anthropic/claude-sonnet-4-6',
  system: 'You are a helpful assistant.',
  inputMessages: [userMessage('Summarize the key points of quantum entanglement.')],
});

if (!result.ok) {
  console.error(result.error.phase, result.error.message);
  process.exit(1);
}

console.log(getText(result.finalAssistantMessage));
console.log('Session saved at:', result.sessionPath);
```

### Example — agent with tools

```ts
import { agent, tool, userMessage, getText } from '@ank1015/llm-sdk';
import { Type } from '@sinclair/typebox';

const readFileTool = tool({
  name: 'read_file',
  description: 'Read a file from disk.',
  parameters: Type.Object({
    path: Type.String({ description: 'Absolute path to the file.' }),
  }),
  execute: async ({ path }) => {
    const content = await fs.readFile(path, 'utf8');
    return { content: [{ type: 'text', content }] };
  },
});

const result = await agent({
  modelId: 'anthropic/claude-sonnet-4-6',
  system: 'You are a coding agent.',
  inputMessages: [userMessage('Find the bug in /app/src/index.ts')],
  tools: [readFileTool],
});

if (result.ok) {
  console.log(getText(result.finalAssistantMessage));
}
```

### Example — continuing a session (multi-turn)

```ts
// First run — no session path needed
const run1 = await agent({
  modelId: 'anthropic/claude-sonnet-4-6',
  inputMessages: [userMessage('My name is Alice.')],
});

// Continue the same conversation
const run2 = await agent({
  modelId: 'anthropic/claude-sonnet-4-6',
  inputMessages: [userMessage('What is my name?')],
  session: { path: run1.sessionPath },
});

console.log(getText(run2.finalAssistantMessage)); // "Your name is Alice."
```

---

## Message helpers

### `userMessage()`

Creates a `UserMessage` with a generated unique `id`.

```ts
function userMessage(content: string | Content, options?: { id?: string; timestamp?: number }): UserMessage
```

```ts
userMessage('Hello')
userMessage([{ type: 'text', content: 'Describe this image.' }, { type: 'image', data: base64, mimeType: 'image/jpeg' }])
```

### `toolResultMessage()`

Creates a `ToolResultMessage` from a tool call result. Handles `id`, `toolName`, `toolCallId`, and `timestamp` automatically.

```ts
function toolResultMessage(options: {
  toolCall: AssistantToolCall;  // from getToolCalls(message)
  content: Content;
  details?: unknown;
  isError?: boolean;
  error?: { message: string; name?: string; stack?: string };
  id?: string;
  timestamp?: number;
}): ToolResultMessage
```

```ts
const result = toolResultMessage({
  toolCall,
  content: [{ type: 'text', content: '72°F, sunny' }],
});

// Error case:
const result = toolResultMessage({
  toolCall,
  content: [{ type: 'text', content: 'City not found.' }],
  isError: true,
});
```

---

## Response helpers

Extract content from a `BaseAssistantMessage` or `AssistantResponse` without manual loops.

```ts
function getText(input: BaseAssistantMessage | AssistantResponse | null | undefined): string
function getThinking(input: BaseAssistantMessage | AssistantResponse | null | undefined): string
function getToolCalls(input: BaseAssistantMessage | AssistantResponse | null | undefined): AssistantToolCall[]
```

```ts
const message = await llm({ ... });

const text = getText(message);          // all text blocks concatenated
const thinking = getThinking(message);  // reasoning trace (empty string if none)
const calls = getToolCalls(message);    // AssistantToolCall[]
```

---

## Defining tools

Use `tool()` to define a tool that `agent()` can execute. The return value is an `AgentTool`.

```ts
function tool(definition: ToolDefinition): AgentTool
```

```ts
interface ToolDefinition {
  name: string;
  description: string;
  parameters: TSchema;  // TypeBox schema
  execute: (params: Static<TSchema>, context: ToolContext) => ToolResult | Promise<ToolResult>;
}

interface ToolContext {
  messages: readonly Message[];  // history at the time of the call
  toolCallId: string;
  signal?: AbortSignal;
  update: (partialResult: ToolResult) => void | Promise<void>; // stream partial results
}

interface ToolResult {
  content: Content;  // what to send back to the model
  details?: unknown; // structured data stored in the session but not sent to the model
}
```

```ts
import { tool } from '@ank1015/llm-sdk';
import { Type } from '@sinclair/typebox';

const searchTool = tool({
  name: 'search',
  description: 'Search the web for a query.',
  parameters: Type.Object({
    query: Type.String({ description: 'Search query.' }),
  }),
  execute: async ({ query }, context) => {
    const results = await webSearch(query);
    return {
      content: [{ type: 'text', content: results.join('\n') }],
    };
  },
});
```

---

## Content types

All messages and tool results use `Content` — an array of typed blocks.

```ts
type Content = Array<TextContent | ImageContent | FileContent>

interface TextContent {
  type: 'text';
  content: string;
}

interface ImageContent {
  type: 'image';
  data: string;     // base64 encoded
  mimeType: string; // e.g. 'image/jpeg', 'image/png'
}

interface FileContent {
  type: 'file';
  data: string;     // base64 encoded
  mimeType: string; // e.g. 'application/pdf'
  filename: string;
}
```

---

## Streaming events

### `BaseAssistantEvent` (from `llm()`)

```ts
type BaseAssistantEvent =
  | { type: 'start';          message: BaseAssistantMessage }
  | { type: 'text_start';     contentIndex: number; message: BaseAssistantMessage }
  | { type: 'text_delta';     contentIndex: number; delta: string; message: BaseAssistantMessage }
  | { type: 'text_end';       contentIndex: number; content: Content; message: BaseAssistantMessage }
  | { type: 'thinking_start'; contentIndex: number; message: BaseAssistantMessage }
  | { type: 'thinking_delta'; contentIndex: number; delta: string; message: BaseAssistantMessage }
  | { type: 'thinking_end';   contentIndex: number; content: string; message: BaseAssistantMessage }
  | { type: 'toolcall_start'; contentIndex: number; message: BaseAssistantMessage }
  | { type: 'toolcall_delta'; contentIndex: number; delta: string; message: BaseAssistantMessage }
  | { type: 'toolcall_end';   contentIndex: number; toolCall: AssistantToolCall; message: BaseAssistantMessage }
  | { type: 'done';           reason: 'stop' | 'length' | 'toolUse'; message: BaseAssistantMessage }
  | { type: 'error';          reason: 'aborted' | 'error'; message: BaseAssistantMessage };
```

### `AgentEvent` (from `agent()`)

```ts
type AgentEvent =
  | { type: 'agent_start' }
  | { type: 'turn_start' }
  | { type: 'message_start'; messageType: 'user' | 'assistant' | 'toolResult' | 'custom'; messageId: string; message: Message }
  | { type: 'message_update'; messageType: 'assistant' | 'custom'; messageId: string; message: Message | BaseAssistantEvent }
  | { type: 'message_end'; messageType: 'user' | 'assistant' | 'toolResult' | 'custom'; messageId: string; message: Message }
  | { type: 'tool_execution_start'; toolCallId: string; toolName: string; args: unknown }
  | { type: 'tool_execution_update'; toolCallId: string; toolName: string; args: unknown; partialResult: ToolResult }
  | { type: 'tool_execution_end'; toolCallId: string; toolName: string; result: ToolResult; isError: boolean }
  | { type: 'turn_end' }
  | { type: 'agent_end'; agentMessages: Message[] };
```

---

## `BaseAssistantMessage` — full shape

Returned by `await llm(...)` and available in `result.finalAssistantMessage` from `agent()`.

```ts
interface BaseAssistantMessage {
  role: 'assistant';
  id: string;
  api: string;             // provider used, e.g. 'anthropic'
  timestamp: number;       // Unix ms
  duration: number;        // ms to complete
  stopReason: 'stop' | 'length' | 'toolUse' | 'error' | 'aborted';
  content: AssistantResponse;
  usage: {
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
      total: number;  // USD
    };
  };
}

type AssistantResponse = Array<
  | { type: 'response';  response: Content }
  | { type: 'thinking';  thinkingText: string }
  | { type: 'toolCall';  name: string; arguments: Record<string, unknown>; toolCallId: string }
>;
```

---

## Errors

```ts
// llm() — throws on setup failure
class LlmInputError extends Error {
  code: 'unsupported_model_id' | 'core_model_not_found' | 'missing_provider_credentials' | 'keys_file_not_found';
  modelId: string;
  keysFilePath: string;
}

// agent() — throws on setup failure; normal run failures go to result.ok === false
class AgentInputError extends Error {
  code: 'unsupported_model_id' | 'core_model_not_found' | 'missing_provider_credentials' | 'keys_file_not_found';
  modelId: string;
  keysFilePath: string;
}

// Both:
try {
  const result = await agent({ ... });
  if (!result.ok) { /* run failed */ }
} catch (e) {
  if (e instanceof AgentInputError) { /* setup failed */ }
}
```

---

## `reasoningEffort` behavior per provider

- `openai` / `codex`: omitted = no reasoning option added. Values map to the provider's `reasoning.effort`.
- `anthropic` / `claude-code`: adaptive thinking is **always enabled** for supported Claude 4.6 models. `reasoningEffort` sets the effort level. Omit for provider default.
- `google`: omitted = provider default. Values map to `thinkingConfig.thinkingLevel`.
