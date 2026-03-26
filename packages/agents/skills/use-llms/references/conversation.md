# Conversation

## Imports

```ts
import { buildUserMessage, createManagedConversation } from '@ank1015/llm-agents';
import type {
  AgentEvent,
  AgentTool,
  Attachment,
  BranchInfo,
  Content,
  CustomNode,
  Message,
  MessageNode,
  Session,
  SessionHeader,
  SessionSummary,
  UserMessage,
} from '@ank1015/llm-agents';
```

## What `createManagedConversation()` Is For

Use `createManagedConversation()` when you need a reusable, stateful conversation object instead of a single request.

This is the right helper when you want:

- multi-turn history kept in memory
- automatic tool execution
- live events while the run is happening
- a reusable object that can handle several prompts over time
- optional file-backed or memory-backed session helpers alongside the conversation

## What This Helper Returns

Without sessions:

```ts
const conversation = createManagedConversation({
  modelId: 'gpt-5.4',
});
```

With sessions:

```ts
const { conversation, sessionManager, sessionsAdapter } = createManagedConversation({
  modelId: 'gpt-5.4-mini',
  sessions: 'memory',
});
```

Important idea:

- `conversation`
  - the live, stateful LLM conversation object
- `sessionManager`
  - a separate persistence helper you can use if you want to store or read sessions
- `sessionsAdapter`
  - the actual file-backed or memory-backed storage implementation

The conversation itself is stateful in memory. Sessions are optional storage helpers layered next to it.

## What Sessions Are

Sessions are not the same thing as the live `Conversation` object.

- `conversation`
  - the in-memory runner you actively prompt
  - holds current message history, tools, usage totals, and run state
- `sessions`
  - an optional persistence layer for saving and loading conversation history outside the live object
  - useful when you want to store transcripts, reload them later, or keep alternate branches of a session

Think of it this way:

- `Conversation`
  - “the thing currently talking to the model”
- `SessionManager`
  - “the thing that saves and loads stored conversation trees”

Important limitation:

- the helper does not automatically sync the conversation to sessions
- if you want persistence, you call `sessionManager` methods yourself

## Session Tree Model

A session is stored as a tree, not just a flat list.

Each session contains:

- one `SessionHeader`
  - the root node
  - stores the session name and metadata
- zero or more `MessageNode` entries
  - each wraps one normalized `Message`
- zero or more `CustomNode` entries
  - app-specific nodes for metadata or workflow state

Each non-header node has:

- `parentId`
  - which earlier node it is attached to
- `branch`
  - which branch that node belongs to

That means a session can represent branching histories, for example:

```text
session header (main)
└─ user message
   └─ assistant message
      ├─ tool result (main)
      │  └─ assistant follow-up (main)
      └─ assistant retry (retry-1)
```

This is why sessions are useful beyond simple transcript storage:

- you can keep alternate continuations
- you can inspect the latest node of a branch
- you can load one branch without flattening the whole tree yourself

## Input Type

```ts
type UseLlmsThinkingLevel = 'low' | 'medium' | 'high' | 'xhigh';

interface ManagedConversationInitialState {
  messages?: Message[];
  usage?: {
    totalTokens: number;
    totalCost: number;
    lastInputTokens: number;
  };
}

interface CreateManagedConversationOptions {
  modelId: 'gpt-5.4' | 'gpt-5.4-mini';
  systemPrompt?: string;
  thinkingLevel?: UseLlmsThinkingLevel;
  sessions?: 'file' | 'memory';
  initialState?: ManagedConversationInitialState;
  tools?: AgentTool[];
}
```

## Option By Option

- `modelId`
  - required
  - chooses the model for the whole conversation
- `systemPrompt`
  - optional system instruction string
  - stays on the conversation until you replace it
- `thinkingLevel`
  - optional reasoning depth hint
  - supported values: `'low' | 'medium' | 'high' | 'xhigh'`
- `sessions`
  - optional session helper mode
  - `'file'` gives you file-backed session storage
  - `'memory'` gives you in-memory session storage
- `initialState`
  - optional state seeding
  - use this when you already have prior messages or usage values
- `tools`
  - optional executable conversation tools
  - yes, `createManagedConversation()` does support a `tools` option
  - unlike `streamLlm()`, these tools can actually be executed by the conversation loop

## Tool Type

Conversation tools are `AgentTool[]`.

Each tool includes both:

- a schema the model sees
- an `execute(...)` function the runtime can call
- `parameters` should be a TypeBox schema object

```ts
interface AgentTool {
  name: string;
  label: string;
  description: string;
  parameters: TSchema;
  execute: (
    toolCallId: string,
    params: unknown,
    signal?: AbortSignal,
    onUpdate?: (partialResult: { content: Content; details: unknown }) => void,
    context?: { messages: readonly Message[] }
  ) => Promise<{
    content: Content;
    details: unknown;
  }>;
}
```

This is the biggest difference from `streamLlm()`:

- `streamLlm()`
  - accepts `Tool[]`
  - does not execute them
- `createManagedConversation()`
  - accepts `AgentTool[]`
  - can execute them automatically

## Basic Usage

```ts
const conversation = createManagedConversation({
  modelId: 'gpt-5.4',
  systemPrompt: 'Act like a careful senior engineer.',
  thinkingLevel: 'high',
});

const newMessages = await conversation.prompt('Review this function for edge cases.');
```

Important result rule:

- `newMessages`
  - contains only the messages produced by that run
- `conversation.state.messages`
  - contains the full accumulated history so far

## Happy Path: Get The Final Assistant Text

`prompt(...)`, `promptMessage(...)`, and `continue()` return `Message[]`, not a plain string.

The normal pattern is:

1. run the conversation method
2. find the latest assistant message in the returned `Message[]`
3. extract the text from that assistant message

Use this helper pair:

```ts
import type { Message, UseLlmsAssistantMessage } from '@ank1015/llm-agents';

function getLatestAssistantMessage(messages: Message[]): UseLlmsAssistantMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];

    if (message?.role === 'assistant') {
      return message as UseLlmsAssistantMessage;
    }
  }

  return undefined;
}

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

Example:

```ts
const newMessages = await conversation.prompt('Reply with exactly OK.');
const assistantMessage = getLatestAssistantMessage(newMessages);
const finalText = assistantMessage ? getAssistantText(assistantMessage) : '';
```

Use the same pattern with:

- `await conversation.prompt(...)`
- `await conversation.promptMessage(...)`
- `await conversation.continue()`
- `conversation.state.messages`

## Main Methods

The returned conversation object is what you work with after creation.

## Method Signatures

```ts
type ConversationExternalCallback = (message: Message) => void | Promise<void>;

interface Attachment {
  id: string;
  type: 'image' | 'file';
  fileName: string;
  mimeType: string;
  size?: number;
  content: string;
}

class Conversation {
  prompt(
    input: string,
    attachments?: Attachment[],
    externalCallback?: ConversationExternalCallback
  ): Promise<Message[]>;

  promptMessage(
    userMessage: UserMessage,
    externalCallback?: ConversationExternalCallback
  ): Promise<Message[]>;

  continue(externalCallback?: ConversationExternalCallback): Promise<Message[]>;

  subscribe(fn: (event: AgentEvent) => void): () => void;
  abort(): void;
  waitForIdle(): Promise<void>;

  setTools(tools: AgentTool[]): void;
  setSystemPrompt(prompt: string): void;
  replaceMessages(messages: Message[]): void;
  appendMessage(message: Message): void;
  appendMessages(messages: Message[]): void;
  clearMessages(): void;
}
```

## Prompt Input Types

For `prompt(input, attachments?, externalCallback?)`, the inputs are:

```ts
type input = string;

interface Attachment {
  id: string;
  type: 'image' | 'file';
  fileName: string;
  mimeType: string;
  size?: number;
  content: string;
}
```

What these mean:

- `input`
  - plain user text
  - this is the same text you would normally type as the next user turn
- `attachments`
  - optional binary inputs attached to that user turn
  - `content` is base64 data without a data URL prefix
  - `type: 'image'` is for image attachments
  - `type: 'file'` is for generic files

So this:

```ts
await conversation.prompt('Summarize this PDF.', [pdfAttachment]);
```

is equivalent to “build a normalized user message from this text plus these attachments, append it, then run the conversation.”

Use `promptMessage(userMessage)` instead when:

- you already have a normalized `UserMessage`
- you want total control over the exact message content before sending

## `prompt(input, attachments?, externalCallback?)`

Use this when you have plain text input and optional attachments.

```ts
const newMessages = await conversation.prompt('Summarize this file.');
```

With attachments:

```ts
const newMessages = await conversation.prompt('Summarize this PDF.', [
  {
    id: 'spec-pdf',
    type: 'file',
    fileName: 'spec.pdf',
    mimeType: 'application/pdf',
    content: pdfBase64,
  },
]);
```

This method:

- builds a normalized `UserMessage` internally
- appends that user message into the conversation state
- runs the conversation loop
- returns only the newly created messages from that run

If you pass `externalCallback`, it is called for each appended message in run order.

## `promptMessage(userMessage, externalCallback?)`

Use this when you already have a fully built `UserMessage`.

```ts
const userMessage = buildUserMessage('Summarize this file.');
const newMessages = await conversation.promptMessage(userMessage);
```

Use this method when:

- you already built the message elsewhere
- you want exact control over content blocks or attachments
- your workflow stores normalized messages already

## `continue(externalCallback?)`

Use this when the conversation should continue from existing state without adding a new user message first.

```ts
const newMessages = await conversation.continue();
```

This is useful when:

- a tool result was appended and you want the assistant to continue
- your code already updated `conversation.state.messages`
- the last message in history is already a valid continuation point

Important requirement:

- the last message must be a `user` or `toolResult` message

## `subscribe(fn)`

Use this to observe live runtime events.

```ts
const unsubscribe = conversation.subscribe((event: AgentEvent) => {
  console.log(event.type);
});
```

Typical uses:

- live UI updates
- streaming assistant text
- tool execution progress
- message lifecycle tracking

The callback receives `AgentEvent` values such as:

- `agent_start`
- `turn_start`
- `message_start`
- `message_update`
- `message_end`
- `tool_execution_start`
- `tool_execution_update`
- `tool_execution_end`
- `turn_end`
- `agent_end`

## `abort()` And `waitForIdle()`

- `abort()`
  - stops the current run if one is active
- `waitForIdle()`
  - resolves when the current run finishes

Use `waitForIdle()` when another part of your code must not mutate the conversation during an active run.

## `conversation.state`

The returned object is not just a runner. It also stores mutable state.

The most important fields are:

```ts
conversation.state.systemPrompt;
conversation.state.provider.model.id;
conversation.state.provider.providerOptions;
conversation.state.messages;
conversation.state.tools;
conversation.state.isStreaming;
conversation.state.pendingToolCalls;
conversation.state.error;
conversation.state.usage.totalTokens;
conversation.state.usage.totalCost;
conversation.state.usage.lastInputTokens;
```

Read this as:

- `messages`
  - the accumulated conversation transcript
- `tools`
  - the currently active executable tools
- `isStreaming`
  - whether a run is active right now
- `pendingToolCalls`
  - tool calls that are currently still in flight
- `usage`
  - cumulative usage totals tracked by the conversation object

## Mutable Methods

These methods let you reshape the conversation between runs.

### `setTools(tools)`

Replaces the active tool list.

Use this when:

- the workflow moves into a new phase
- different steps need different tools

### `setSystemPrompt(prompt)`

Replaces the system prompt for future runs.

### `replaceMessages(messages)`

Replaces the full message history.

### `appendMessage(message)` / `appendMessages(messages)`

Appends already-normalized messages directly into history.

These methods are useful, but the safest default pattern is:

1. create the conversation
2. call `prompt(...)` or `promptMessage(...)`
3. read `conversation.state.messages`

## Session Modes

If you set `sessions: 'file'` or `sessions: 'memory'`, the helper returns:

```ts
{
  conversation,
  sessionManager,
  sessionsAdapter,
}
```

### File Mode

```ts
const managed = createManagedConversation({
  modelId: 'gpt-5.4',
  sessions: 'file',
});
```

What file mode means:

- sessions are stored on disk
- they survive process restarts
- they can be loaded again later by project name, path, and session ID
- the underlying storage format is append-only JSONL

Default storage location:

```text
~/.llm/sessions/<projectName>/<path>/<sessionId>.jsonl
```

Example:

```text
~/.llm/sessions/my-project/chats/feature-a/01HV...ABCD.jsonl
```

Important note for this skill:

- `createManagedConversation({ sessions: 'file' })` uses the default file session location
- this helper does not expose a custom base directory option

### Memory Mode

```ts
const managed = createManagedConversation({
  modelId: 'gpt-5.4-mini',
  sessions: 'memory',
});
```

What memory mode means:

- sessions live only in process memory
- nothing is written to disk
- all session data disappears when the process exits

Use this when:

- you want temporary session state
- you are testing or prototyping
- you do not need persistence after the script ends

## `sessionManager`

When sessions are enabled, `sessionManager` is the high-level API you use.

```ts
class SessionManager {
  createSession(input: {
    projectName: string;
    path?: string;
    sessionName?: string;
  }): Promise<{ sessionId: string; header: SessionHeader }>;

  listProjects(): Promise<string[]>;
  listSessions(projectName: string, path?: string): Promise<SessionSummary[]>;
  getSession(projectName: string, sessionId: string, path?: string): Promise<Session | undefined>;

  appendMessage(input: {
    projectName: string;
    path: string;
    sessionId?: string;
    parentId: string;
    branch: string;
    message: Message;
    api: string;
    modelId: string;
    providerOptions?: Record<string, unknown>;
  }): Promise<{ sessionId: string; node: MessageNode }>;

  getMessages(
    projectName: string,
    sessionId: string,
    branch?: string,
    path?: string
  ): Promise<MessageNode[] | undefined>;

  getBranches(
    projectName: string,
    sessionId: string,
    path?: string
  ): Promise<BranchInfo[] | undefined>;

  getBranchHistory(
    projectName: string,
    sessionId: string,
    branch: string,
    path?: string
  ): Promise<Array<SessionHeader | MessageNode | CustomNode> | undefined>;

  getLatestNode(
    projectName: string,
    sessionId: string,
    branch?: string,
    path?: string
  ): Promise<SessionHeader | MessageNode | CustomNode | undefined>;

  getNode(
    projectName: string,
    sessionId: string,
    nodeId: string,
    path?: string
  ): Promise<SessionHeader | MessageNode | CustomNode | undefined>;

  searchSessions(projectName: string, query: string, path?: string): Promise<SessionSummary[]>;
}
```

What the main methods are for:

- `createSession(...)`
  - creates a new stored session and returns `{ sessionId, header }`
- `listSessions(projectName, path?)`
  - lists session summaries for one project/path
- `getSession(projectName, sessionId, path?)`
  - loads the full session tree
- `appendMessage(...)`
  - stores one message node in the tree
- `getMessages(projectName, sessionId, branch?, path?)`
  - returns only message nodes, which is usually the easiest way to rebuild chat history
- `getBranchHistory(projectName, sessionId, branch, path?)`
  - returns the linear history for one branch
- `getLatestNode(projectName, sessionId, branch?, path?)`
  - returns the last node overall or on one branch
- `getBranches(projectName, sessionId, path?)`
  - returns branch metadata like branch names and branch points
- `searchSessions(projectName, query, path?)`
  - finds sessions by session name

## How To Create And Append To A Session

The safest workflow is:

1. create a session
2. use the returned header ID as the first `parentId`
3. append message nodes as the conversation evolves

Example:

```ts
const managed = createManagedConversation({
  modelId: 'gpt-5.4',
  sessions: 'file',
});

const { sessionManager, conversation } = managed;

const { sessionId, header } = await sessionManager.createSession({
  projectName: 'demo',
  path: 'chats',
  sessionName: 'Architecture Review',
});

const newMessages = await conversation.prompt('Review this design.');

let parentId = header.id;
for (const message of newMessages) {
  const { node } = await sessionManager.appendMessage({
    projectName: 'demo',
    path: 'chats',
    sessionId,
    parentId,
    branch: 'main',
    message,
    api: conversation.state.provider.model.api,
    modelId: conversation.state.provider.model.id,
    providerOptions: conversation.state.provider.providerOptions,
  });

  parentId = node.id;
}
```

Why `parentId` matters:

- it is what turns the session into a tree
- each appended node points at the node it continues from

## How To Load Messages Back Into A Conversation

`SessionManager` stores `MessageNode` objects, not just raw `Message[]`.

So the common restore flow is:

1. load message nodes
2. map them to `.message`
3. replace the live conversation history

Example:

```ts
const managed = createManagedConversation({
  modelId: 'gpt-5.4',
  sessions: 'file',
});

const messageNodes =
  (await managed.sessionManager.getMessages('demo', sessionId, 'main', 'chats')) ?? [];

managed.conversation.replaceMessages(messageNodes.map((node) => node.message));
```

If you want the whole stored tree instead of just flat messages:

```ts
const session = await managed.sessionManager.getSession('demo', sessionId, 'chats');
```

Use:

- `getMessages(...)`
  - when you want chat history quickly
- `getSession(...)`
  - when you want the full tree
- `getBranchHistory(...)`
  - when you want one branch’s linear path

## What Session Data Looks Like

At a high level:

```ts
interface SessionHeader {
  type: 'session';
  id: string;
  parentId: null;
  branch: 'main';
  timestamp: string;
  sessionName: string;
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
  nodes: Array<SessionHeader | MessageNode | CustomNode>;
}

interface BranchInfo {
  name: string;
  branchPointId: string | null;
  nodeCount: number;
  latestNodeId: string;
}
```

Useful mental model:

- `Session`
  - the whole stored tree
- `SessionHeader`
  - the root node
- `MessageNode`
  - one stored chat message plus model metadata
- `BranchInfo`
  - summary data for one branch

## How File And Memory Sessions Differ In Practice

- `file`
  - survives process restarts
  - stored under `~/.llm/sessions/...`
  - useful for real persistence and later reload
- `memory`
  - not persisted anywhere
  - reset when the process ends
  - useful for tests, temporary runs, and scratch workflows

Important limitation:

- the helper does not automatically create sessions
- the helper does not automatically append conversation messages to sessions
- the helper does not automatically load session history into the conversation

If you want persistence, you call `sessionManager` yourself.

## Tool Workflow Example

```ts
const tools: AgentTool[] = [
  {
    name: 'read_file',
    label: 'Read File',
    description: 'Read a file from disk',
    parameters: schema,
    async execute(_toolCallId, params) {
      return {
        content: [{ type: 'text', content: `contents for ${String(params.path)}` }],
        details: { ok: true },
      };
    },
  },
];

const conversation = createManagedConversation({
  modelId: 'gpt-5.4',
  tools,
});

await conversation.prompt('Read package.json and summarize it.');
```

In this flow:

1. the assistant can decide to use `read_file`
2. the conversation runtime calls `execute(...)`
3. tool results are added into the message flow
4. the assistant continues with the new context

## Initial State Example

```ts
const conversation = createManagedConversation({
  modelId: 'gpt-5.4-mini',
  initialState: {
    messages: existingMessages,
    usage: {
      totalTokens: 1200,
      totalCost: 0.02,
      lastInputTokens: 400,
    },
  },
});
```

Use this when:

- you already have in-memory transcript data
- you want the new conversation object to start from existing history
- you want usage counters to continue from a known value

## Important Behavior

- the helper always uses the default file-based key storage automatically
- assistant message streaming is on by default
- the helper does not expose advanced queue, context-limit, or cost-limit controls
- the helper does not expose a custom message transformer
- `streamLlm()` supports tool schemas only, while `createManagedConversation()` supports executable tools
- sessions are optional and separate from the live in-memory conversation state
- no session persistence happens unless you call `sessionManager` methods yourself

## When To Use This Instead Of `streamLlm()`

Use `createManagedConversation()` when you need:

- multi-turn state
- automatic tool execution
- live event subscription
- direct access to mutable conversation state
- a reusable object across several prompts

Use `streamLlm()` when you only need a single request stream and do not need a stateful conversation object.
