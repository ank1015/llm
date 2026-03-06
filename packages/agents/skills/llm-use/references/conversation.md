# Conversation

Use this reference when the task needs a stateful agent loop, tool execution, multi-turn context, or event-driven updates.

## Contents

- [Public Imports](#public-imports)
- [When To Use `Conversation`](#when-to-use-conversation)
- [Canonical Setup](#canonical-setup)
- [`ConversationOptions`](#conversationoptions)
- [Core Methods](#core-methods)
- [Prompt and Continue](#prompt-and-continue)
- [Tools](#tools)
- [Events](#events)
- [Persistence Hook](#persistence-hook)
- [Practical Rules](#practical-rules)

## Public Imports

```ts
import { Conversation, getModel } from '@ank1015/llm-sdk';
import { createFileKeysAdapter } from '@ank1015/llm-sdk-adapters';

import type {
  AgentEvent,
  AgentTool,
  Attachment,
  ConversationExternalCallback,
  ConversationOptions,
} from '@ank1015/llm-sdk';
```

## When To Use `Conversation`

Use `Conversation` instead of one-off `complete()` or `stream()` when the task needs any of these:

- more than one turn with shared state
- tool execution
- event subscriptions during a run
- abort or wait-for-idle control
- reusable in-memory conversation state

## Canonical Setup

```ts
const model = getModel('openai', 'gpt-5-mini');
if (!model) {
  throw new Error('Model not found');
}

const keysAdapter = createFileKeysAdapter();

const conversation = new Conversation({
  keysAdapter,
  streamAssistantMessage: true,
});

conversation.setProvider({ model });
conversation.setSystemPrompt('You are a coding assistant.');
```

Prefer `keysAdapter` here for the same reason as one-off calls: keep credentials out of normal task code.

## `ConversationOptions`

The most useful public options for normal task code are:

- `keysAdapter`
- `usageAdapter` if a separate task explicitly needs usage tracking
- `initialState` when hydrating an existing conversation
- `streamAssistantMessage`
- `costLimit` and `contextLimit`

Reach for `messageTransformer` or `queueMode` only when the task clearly needs custom queue handling.

## Core Methods

Commonly used public methods:

- `setProvider(...)`
- `setTools(...)`
- `setSystemPrompt(...)`
- `prompt(input, attachments?, externalCallback?)`
- `continue(externalCallback?)`
- `subscribe(listener)`
- `abort()`
- `waitForIdle()`
- `reset()`

## Prompt and Continue

`prompt()` creates a new user message and runs the agent loop:

```ts
const newMessages = await conversation.prompt('Summarize this PR.');
```

`continue()` resumes from the current in-memory history:

```ts
const nextMessages = await conversation.continue();
```

Use `continue()` only when the current message history already ends in a user or tool-result message that should drive another assistant turn.

## Tools

Use `AgentTool` for tool-capable agent tasks:

```ts
const calculatorParameters = /* TypeBox schema for { expression: string } */;

const tools: AgentTool[] = [
  {
    label: 'Calculator',
    name: 'calculate',
    description: 'Evaluate simple arithmetic expressions',
    parameters: calculatorParameters,
    execute: async (_toolCallId, params) => {
      const expression =
        typeof params === 'object' && params !== null && 'expression' in params
          ? String(params.expression)
          : '';
      const result = new Function(`return (${expression})`)();
      return {
        content: [{ type: 'text', content: `${expression} = ${String(result)}` }],
        details: { expression, result },
      };
    },
  },
];

conversation.setTools(tools);
```

`parameters` must be a TypeBox schema. Reuse an existing schema module when the repo already has one. If helper code in `max-skills` truly needs a brand-new tool schema, add `@sinclair/typebox` there first instead of faking the type with a loose cast.

The public tool shape to remember:

- `AgentTool`
- `AgentToolResult<T>`
- `Attachment` for binary user inputs passed to `prompt()`

## Events

Subscribe when the caller needs live updates:

```ts
const unsubscribe = conversation.subscribe((event: AgentEvent) => {
  if (event.type === 'message_update' && event.messageType === 'assistant') {
    // stream updates
  }

  if (event.type === 'tool_execution_start') {
    // tool lifecycle start
  }
});
```

High-value behavior:

- listeners receive assistant stream updates during `prompt()` or `continue()`
- listeners also receive tool lifecycle events and message lifecycle events
- unsubscribe when the run-specific listener is no longer needed

## Persistence Hook

`ConversationExternalCallback` is the public persistence hook. The callback runs for each appended message during a prompt or continue cycle.

```ts
const persistMessage: ConversationExternalCallback = async (message) => {
  console.log('Persist message', message.role, message.id);
};

await conversation.prompt('Hello', undefined, persistMessage);
```

Use this hook to write messages into a `SessionManager` flow instead of inventing custom persistence logic.

If the callback throws, the run fails. Keep persistence code small and deterministic.

## Practical Rules

- Reuse the same `Conversation` instance across turns when context matters.
- Use `replaceMessages(...)` when hydrating saved history into a new `Conversation`.
- Use `waitForIdle()` before shutdown or cleanup if a run may still be active.
- Use `abort()` when a caller needs cancellation behavior.
- Use `reset()` when the task explicitly wants to clear the current in-memory history and run state.
