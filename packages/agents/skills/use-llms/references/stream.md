# Stream

## Imports

```ts
import { buildUserMessage, streamLlm } from '@ank1015/llm-agents';
import type { Message, Tool } from '@ank1015/llm-agents';
```

## What `streamLlm()` Is For

Use `streamLlm()` for a one-off LLM call when you want:

- a direct request/response flow
- streaming text or events while the model is generating
- optional tool schemas without a long-lived conversation object
- full control over what to do after a tool call is returned

## Input Type

`streamLlm()` takes this input shape:

```ts
type UseLlmsThinkingLevel = 'low' | 'medium' | 'high' | 'xhigh';

interface StreamLlmOptions {
  modelId: 'gpt-5.4' | 'gpt-5.4-mini';
  messages: Message[];
  systemPrompt?: string;
  tools?: Tool[];
  thinkingLevel?: UseLlmsThinkingLevel;
}
```

## Option By Option

- `modelId`
  - required
  - chooses one of the supported model IDs
- `messages`
  - required
  - the full normalized message history for this request
  - for a simple one-off call, this is usually just one user message
- `systemPrompt`
  - optional system instruction string
  - use this for stable behavior rules that apply to the whole request
- `tools`
  - optional plain tool definitions
  - yes, `streamLlm()` does support a `tools` option
  - these tools are schemas only
  - `streamLlm()` does not execute them
- `thinkingLevel`
  - optional reasoning depth hint
  - supported values: `'low' | 'medium' | 'high' | 'xhigh'`

## Message Input Notes

- `messages`
  - is a normalized `Message[]`
  - use `buildUserMessage(...)` for the common case
  - you can also reuse prior `assistant` and `toolResult` messages when building a follow-up request yourself

Simple example:

```ts
const messages: Message[] = [buildUserMessage('Summarize the latest changes in this file.')];
```

## Tool Shape

If you pass `tools`, each tool should look like this:

```ts
interface Tool {
  name: string;
  description: string;
  parameters: TSchema;
}
```

Use this shape when:

- you want the model to choose a tool and return tool-call blocks
- you want to inspect those tool calls yourself
- you do not need automatic tool execution

## Request Shape

```ts
const stream = await streamLlm({
  modelId: 'gpt-5.4',
  messages: [buildUserMessage('Summarize the latest changes in this file.')],
  systemPrompt: 'Be concise and exact.',
  thinkingLevel: 'high',
});
```

## Behavior

- always uses the default file-based key storage automatically
- forwards `messages`, `systemPrompt`, and `tools`
- if `thinkingLevel` is provided, it configures the underlying reasoning effort for that request
- returns a `UseLlmsStream`

## Tool Handling

`streamLlm()` is just a streaming LLM call. It does not run tools.

If the assistant decides to use a tool, you will see tool-call content in the streamed events or in the final assistant message. Your code is then responsible for:

1. reading the tool call
2. executing the tool yourself
3. deciding whether to call `streamLlm()` again with the tool result added to the message history

## Result Handling

If you only need the final text, use this as the default happy path:

```ts
import type { UseLlmsAssistantMessage } from '@ank1015/llm-agents';

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

const stream = await streamLlm({
  modelId: 'gpt-5.4-mini',
  messages: [buildUserMessage('Reply with exactly OK.')],
});

const finalMessage = await stream.drain();
const finalText = getAssistantText(finalMessage);
```

Use `drain()` when you do not care about intermediate events and only want the final message.

If you want both streamed text and a final fallback, use this pattern:

```ts
const stream = await streamLlm({
  modelId: 'gpt-5.4-mini',
  messages: [buildUserMessage('Reply with exactly OK.')],
});

let streamedText = '';

for await (const event of stream) {
  if (event.type === 'text_delta') {
    streamedText += event.delta;
  }
}

const finalMessage = await stream.result();
const finalText = streamedText || getAssistantText(finalMessage);
```

Use the returned stream directly:

```ts
const stream = await streamLlm({
  modelId: 'gpt-5.4-mini',
  messages: [buildUserMessage('List three test cases for this function.')],
  thinkingLevel: 'medium',
});

for await (const event of stream) {
  console.log(event.type);
}

const finalMessage = await stream.result();
```

`stream.result()` and `stream.drain()` both give you the final `UseLlmsAssistantMessage`.

## Important Behavior

- this helper does not keep any conversation state between calls
- this helper does not execute tools
- if you need automatic tool execution or persistent in-memory state, use `createManagedConversation()`

## When To Use This Helper

Use `streamLlm()` when the task is a single call, a quick structured follow-up, or a lightweight helper script that does not need a long-lived conversation object.
