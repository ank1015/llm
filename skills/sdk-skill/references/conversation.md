# Conversation Class

The `Conversation` class is a stateful agent that wraps the core `runAgentLoop`. It manages messages, tools, provider config, streaming state, budget limits, and event emission.

## Basic Setup

```ts
import { Conversation, getModel } from '@ank1015/llm-sdk';

const convo = new Conversation();
convo.setProvider({ model: getModel('anthropic', 'claude-sonnet-4-5')! });
convo.setSystemPrompt('You are a helpful assistant.');

const newMessages = await convo.prompt('Hello, what can you do?');
console.log(newMessages); // Message[] — all messages generated during this prompt
```

### With Adapters

```ts
import { Conversation, getModel } from '@ank1015/llm-sdk';
import { createFileKeysAdapter, createSqliteUsageAdapter } from '@ank1015/llm-sdk-adapters';

const convo = new Conversation({
  keysAdapter: createFileKeysAdapter(),
  usageAdapter: createSqliteUsageAdapter(),
  costLimit: 1.0, // stop at $1.00 USD
  contextLimit: 100000, // stop at 100k input tokens
});
convo.setProvider({ model: getModel('anthropic', 'claude-sonnet-4-5')! });
```

## ConversationOptions

```ts
interface ConversationOptions {
  initialState?: Partial<AgentState>;
  messageTransformer?: (messages: Message[]) => Message[] | Promise<Message[]>;
  queueMode?: 'all' | 'one-at-a-time'; // default: 'one-at-a-time'
  keysAdapter?: KeysAdapter;
  usageAdapter?: UsageAdapter;
  costLimit?: number;
  contextLimit?: number;
  streamAssistantMessage?: boolean; // default: true
}
```

## Defining Tools (AgentTool)

Tools use TypeBox schemas for parameters. The `execute` function runs when the LLM calls the tool.

```ts
import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@ank1015/llm-sdk';

const searchTool: AgentTool = {
  name: 'search_files',
  label: 'Search Files',
  description: 'Search for files matching a pattern',
  parameters: Type.Object({
    pattern: Type.String({ description: 'Glob pattern to search' }),
    directory: Type.Optional(Type.String({ description: 'Base directory' })),
  }),
  execute: async (toolCallId, params, signal, onUpdate, context) => {
    // params is typed as { pattern: string; directory?: string }
    const results = await searchFiles(params.pattern, params.directory);
    return {
      content: [{ type: 'text', content: JSON.stringify(results) }],
      details: { matchCount: results.length },
    };
  },
};

convo.setTools([searchTool]);
```

### Execute Signature

```ts
execute: (
  toolCallId: string,
  params: Static<TParameters>, // typed from schema
  signal?: AbortSignal, // for cancellation
  onUpdate?: AgentToolUpdateCallback, // partial result streaming
  context?: ToolExecutionContext // read-only message history
) => Promise<AgentToolResult<TDetails>>;
```

### AgentToolResult Shape

```ts
interface AgentToolResult<T> {
  content: Content; // text/image/file blocks sent back to model
  details: T; // extra data for UI/logging (not sent to model)
}
```

## Agent Loop Flow

When you call `prompt()`, the Conversation:

1. Builds user message, appends to history
2. Sends messages to LLM (with messageTransformer applied)
3. If LLM returns tool calls → executes tools → sends results back → loops
4. Repeats until LLM stops calling tools (stopReason = 'stop' | 'length')
5. Returns all new messages generated during the run

## Subscribing to Events

```ts
const unsubscribe = convo.subscribe((event) => {
  switch (event.type) {
    case 'agent_start':
      break;
    case 'turn_start':
      break;
    case 'message_start':
      // event.messageType: 'user' | 'assistant' | 'toolResult' | 'custom'
      // event.messageId, event.message
      break;
    case 'message_update':
      // event.messageType: 'assistant' | 'custom'
      // For assistant: event.message is BaseAssistantEvent (streaming deltas)
      break;
    case 'message_end':
      // Final message after streaming completes
      break;
    case 'tool_execution_start':
      // event.toolCallId, event.toolName, event.args
      break;
    case 'tool_execution_update':
      // event.partialResult — from onUpdate callback
      break;
    case 'tool_execution_end':
      // event.result, event.isError
      break;
    case 'turn_end':
      break;
    case 'agent_end':
      // event.agentMessages — all messages from this run
      break;
  }
});

// Clean up
unsubscribe();
```

### Event Lifecycle

```
agent_start
  → turn_start
    → message_start (user)
    → message_end (user)
    → message_start (assistant)
    → message_update (assistant) × N  ← streaming deltas
    → message_end (assistant)
    → tool_execution_start
    → tool_execution_update × N       ← optional partial results
    → tool_execution_end
    → message_start (toolResult)
    → message_end (toolResult)
  → turn_end
  → turn_start                         ← next loop iteration
    → ...
  → turn_end
→ agent_end
```

## Continue From Last Message

```ts
// Continue without adding a new user message
// Last message must be 'user' or 'toolResult' role
const newMessages = await convo.continue();
```

## Message Queuing

Inject messages between agent turns (e.g., user interruptions, system notifications):

```ts
await convo.queueMessage({
  role: 'user',
  id: 'injected-1',
  content: [{ type: 'text', content: 'Actually, also check the logs directory' }],
});
```

Queue modes:

- `'one-at-a-time'` (default) — dequeues one message per turn
- `'all'` — drains entire queue at once

```ts
convo.setQueueMode('all');
```

## Message Transformer

Pre-process messages before sending to the LLM (useful for RAG, context window management):

```ts
const convo = new Conversation({
  messageTransformer: async (messages) => {
    // Example: trim old messages to stay within context
    if (messages.length > 20) {
      return messages.slice(-20);
    }
    return messages;
  },
});
```

## Budget Limits

```ts
convo.setCostLimit(2.5); // max $2.50 USD
convo.setContextLimit(150000); // max 150k input tokens

// Read current usage
console.log(convo.state.usage.totalCost);
console.log(convo.state.usage.totalTokens);
```

Exceeding cost limit throws `CostLimitError`. Context limit is passed to the agent runner budget.

## Abort and Reset

```ts
// Abort current execution
convo.abort();

// Wait for current prompt to finish
await convo.waitForIdle();

// Full reset: abort + clear messages, queue, errors
convo.reset();
```

## External Callback (Session Persistence)

The `externalCallback` on `prompt()`/`continue()` fires for every message appended during the run. Use it to persist messages to a session:

```ts
const newMessages = await convo.prompt('Hello', undefined, async (message) => {
  await sessionManager.appendMessage({
    projectName: 'my-app',
    path: '',
    sessionId: session.sessionId,
    parentId: lastNodeId,
    branch: 'main',
    message,
    api: convo.state.provider.model.api,
    modelId: convo.state.provider.model.id,
  });
});
```

If the callback throws, the conversation aborts.

## Custom Messages

Add non-LLM messages (metadata, annotations) to the conversation:

```ts
await convo.addCustomMessage({ type: 'note', text: 'User switched to dark mode' });
// Emits message_start/update/end events, waits for idle before appending
```

## State Access

```ts
const state = convo.state;
state.messages; // Message[]
state.tools; // AgentTool[]
state.provider; // Provider<Api>
state.isStreaming; // boolean
state.pendingToolCalls; // Set<string>
state.usage; // { totalTokens, totalCost, lastInputTokens }
state.error; // string | undefined
state.systemPrompt; // string | undefined
state.costLimit; // number | undefined
state.contextLimit; // number | undefined
```

## Mutation Helpers

```ts
convo.replaceMessages(newMessages);
convo.appendMessage(msg);
convo.appendMessages(msgs);
convo.removeMessage(messageId); // returns boolean
convo.updateMessage(messageId, (m) => ({ ...m /* changes */ }));
convo.clearMessages();
convo.clearMessageQueue();
convo.clearListeners();
```

## Error Handling

```ts
try {
  await convo.prompt('Hello');
} catch (e) {
  if (e instanceof ConversationBusyError) {
    // Already streaming — wait or abort first
  } else if (e instanceof ModelNotConfiguredError) {
    // No provider set — call setProvider() first
  } else if (e instanceof CostLimitError) {
    // Budget exceeded
  } else if (e instanceof ApiKeyNotFoundError) {
    // Credentials not found
  }
}
```
