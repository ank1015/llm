# `agent()`

The function for making stateful agent runs.

```ts
import { agent, AgentInputError, getText, userMessage } from '@ank1015/llm-sdk';
```

---

## Basic usage

```ts
const result = await agent({
  modelId: 'anthropic/claude-sonnet-4-6',
  system: 'You are a helpful coding agent.',
  inputMessages: [userMessage('Find the bug and fix it.')],
  tools: [readFileTool, searchDocsTool],
});

if (!result.ok) {
  console.error(result.error.message);
  process.exit(1);
}

console.log(result.sessionPath); // path to the saved session file
console.log(result.finalAssistantMessage); // last assistant message from this run
```

`await agent(...)` returns an `AgentResult` union when the agent finishes.

Setup failures like an unsupported `modelId` or missing provider credentials reject with `AgentInputError`, just like `llm()`.

---

## Streaming

`agent()` returns an `AgentRun` — you can either `await` it for the final result, or iterate it for live events:

```ts
const run = agent({
  modelId: 'anthropic/claude-sonnet-4-6',
  inputMessages,
  tools,
});

console.log(run.sessionPath); // available immediately

for await (const event of run) {
  if (event.type === 'tool_execution_start') {
    console.log(`Running ${event.toolName}...`);
  }
}

// After iteration, await for the final result
const result = await run;
```

You can also just `await run.drain()` to consume all events and get the final result without handling each event.

Important: a run only has one event-stream consumer. The supported patterns are:

- `await agent(...)`
- `const run = agent(...); for await (const event of run) { ... } const result = await run`

If `await` / `.then()` / `.drain()` claims the run first, later iteration will throw instead of silently dropping events.

---

## Input

```ts
type AgentInput<TModelId extends CuratedModelId = CuratedModelId> = {
  modelId: TModelId; // which model to use
  inputMessages?: Message[]; // new messages for this run
  system?: string; // system prompt
  tools?: AgentTool[]; // executable tools
  session?: {
    path?: string; // existing or new session file
    branch?: string; // branch to continue, default 'main'
    headId?: string; // specific node to continue from
    title?: string; // title for a newly-created session
    loadMessages?: SessionMessagesLoader;
    saveNode?: SessionNodeSaver;
  };
  reasoningEffort?: ReasoningEffort; // 'low' | 'medium' | 'high' | 'xhigh'
  overrideProviderSetting?: Partial<ProviderOptionsForModelId<TModelId>>;
  keysFilePath?: string; // custom path to keys file
  signal?: AbortSignal; // cancel the run
  maxTurns?: number; // default 20
};
```

### `modelId`

Pick one of the supported model IDs:

| Provider      | Model IDs                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------ |
| `openai`      | `openai/gpt-5.4`, `openai/gpt-5.4-pro`, `openai/gpt-5.4-mini`, `openai/gpt-5.4-nano`, `openai/gpt-5.3-codex` |
| `codex`       | `codex/gpt-5.4`, `codex/gpt-5.4-mini`, `codex/gpt-5.3-codex`, `codex/gpt-5.3-codex-spark`                    |
| `anthropic`   | `anthropic/claude-opus-4-6`, `anthropic/claude-sonnet-4-6`                                                   |
| `claude-code` | `claude-code/claude-opus-4-6`, `claude-code/claude-sonnet-4-6`                                               |
| `google`      | `google/gemini-3.1-pro-preview`, `google/gemini-3-flash-preview`, `google/gemini-3.1-flash-lite-preview`     |

Import `CuratedModelId` if you need the TypeScript type.

### `inputMessages`

The new messages for this run as a `Message[]`. See [types.md](./types.md) for the full `Message` shape.

For a simple run, just pass a single user message:

```ts
inputMessages: [userMessage('Hello')];
```

These are **not** the full conversation history. `agent()` loads previous messages from the session automatically, then appends `inputMessages` before running.

`userMessage()` is the easiest way to create input messages because it generates a unique `id` for you. If you need full control, you can still pass a raw `UserMessage` object.

### `system`

Optional system prompt string.

```ts
system: 'You are a coding agent that explains changes clearly.';
```

### `tools`

Optional array of `AgentTool` objects.

Unlike `llm()`, `agent()` actually executes tools. In most cases you should create tools with the SDK `tool()` helper:

```ts
const getWeather = tool({
  name: 'get_weather',
  description: 'Get the current weather for a city.',
  parameters: Type.Object({
    city: Type.String(),
  }),
  execute: async ({ city }) => ({
    content: [{ type: 'text', content: `Weather for ${city}` }],
  }),
});
```

### `session`

Controls how the JSONL session is loaded and saved.

```ts
session: {
  path: '/path/to/session.jsonl',
  branch: 'main',
  headId: 'node-id',
  title: 'Debugging session',
}
```

Behavior:

- If `session.path` is omitted, the SDK creates a session file automatically under `~/.llm-sdk/sessions`.
- If `session.path` exists, previous messages are loaded from that session.
- If `session.headId` is provided, that exact lineage is loaded.
- Otherwise `session.branch ?? 'main'` is used.
- `inputMessages` are appended to the session before the run starts.
- Messages produced during the run are appended automatically.

### `session.loadMessages`

Optional custom loader for advanced cases.

If provided, the SDK still resolves the session and lineage for you, then calls your loader to turn that lineage into `Message[]`.

### `session.saveNode`

Optional custom saver for advanced cases.

If provided, the SDK calls it for every appended message node instead of using the default JSONL file append behavior.

### `reasoningEffort`

For models that support reasoning/thinking, controls how much the model reasons before responding.

```ts
type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh';
```

Notes:

- `openai` and `codex`: if omitted, no standardized reasoning setting is added.
- `anthropic` and `claude-code`: this SDK always enables adaptive thinking for the supported Claude 4.6 models. `reasoningEffort` sets the adaptive effort level. If omitted, adaptive thinking is still enabled and the provider default effort is used.
- `google`: if omitted, no explicit thinking level is added and the provider default applies.

### `overrideProviderSetting`

Pass provider-specific options not covered by the standard interface.

```ts
import type { ProviderOptionsForModelId } from '@ank1015/llm-sdk';

overrideProviderSetting: {
  max_tokens: 256,
} satisfies Partial<ProviderOptionsForModelId<'anthropic/claude-sonnet-4-6'>>
```

If you call `agent({...})` with a literal `modelId`, TypeScript will usually infer the correct provider-specific type for `overrideProviderSetting` automatically.

### `keysFilePath`

By default the SDK reads credentials from `~/.llm-sdk/keys.env`. Pass a custom path here to override it.

### `signal`

Abort signal for cancelling the run.

### `maxTurns`

Maximum number of turns before the run stops with a limit error.

Default: `20`

---

## Return value — `AgentRun`

```ts
interface AgentRun extends AsyncIterable<AgentEvent>, PromiseLike<AgentResult> {
  readonly sessionPath: string;
  drain(): Promise<AgentResult>;
}
```

Three ways to consume an `AgentRun`:

```ts
// 1. Await the final result (no streaming)
const result = await agent({ ... });

// 2. Stream events, then get the final result
const run = agent({ ... });
console.log(run.sessionPath);
for await (const event of run) { /* handle events */ }
const result = await run;

// 3. Drain all events silently, get the final result
const result = await agent({ ... }).drain();
```

Do not start `await run` and `for await (const event of run)` at the same time.

`run.sessionPath` is available immediately, even when the SDK auto-generates the session path for you.

---

## The final `AgentResult`

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

### Checking success or failure

```ts
const result = await agent({ ... });

if (!result.ok) {
  console.error(result.error.phase);
  console.error(result.error.message);
  return;
}

console.log(result.sessionPath);
console.log(result.messages);    // full branch history after the run
console.log(result.newMessages);
```

### Reading text from the final assistant message

```ts
import { getText } from '@ank1015/llm-sdk';

if (result.ok && result.finalAssistantMessage) {
  console.log(getText(result.finalAssistantMessage));
}
```

You can also use `getThinking(result.finalAssistantMessage)` and `getToolCalls(result.finalAssistantMessage)` when you need the reasoning trace or the tool calls from the final assistant message.

### Understanding `messages` and `newMessages`

`messages` is the full branch history after the run finishes.

That includes:

- messages loaded from the session
- the `inputMessages` you passed in
- the assistant messages and tool result messages produced during this run

Use `messages` when you want the full conversation without doing any merging yourself.

`newMessages` only includes the messages produced during this run.

That can include:

- assistant messages
- tool result messages

Use `newMessages` when you specifically want the delta from this run.

---

## Errors

`agent()` behaves like this:

- setup failures throw `AgentInputError`
- normal run failures return `AgentResult` with `ok: false`

```ts
try {
  const result = await agent({ modelId: 'openai/gpt-5.4-mini', inputMessages });

  if (!result.ok) {
    console.error(result.error.phase);
    console.error(result.error.message);
  }
} catch (error) {
  if (error instanceof AgentInputError) {
    console.error(error.code);
    console.error(error.message);
  }
}
```

---

## Streaming events — `AgentEvent`

When iterating an `AgentRun`, each event has a `type` field:

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

`agent()` forwards the core `AgentEvent` values unchanged.
