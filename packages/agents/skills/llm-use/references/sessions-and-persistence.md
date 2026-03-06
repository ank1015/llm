# Sessions and Persistence

Use this reference when the task needs durable or replayable conversation state.

## Contents

- [Public Imports](#public-imports)
- [Session Adapters](#session-adapters)
- [Core Public Workflow](#core-public-workflow)
- [Core Types](#core-types)
- [Canonical Conversation Persistence Pattern](#canonical-conversation-persistence-pattern)
- [Practical Notes](#practical-notes)

## Public Imports

```ts
import { Conversation, createSessionManager, getModel } from '@ank1015/llm-sdk';
import {
  createFileKeysAdapter,
  createFileSessionsAdapter,
  InMemorySessionsAdapter,
} from '@ank1015/llm-sdk-adapters';

import type {
  ConversationExternalCallback,
  MessageNode,
  Session,
  SessionHeader,
  SessionNode,
  SessionSummary,
} from '@ank1015/llm-sdk';
```

## Session Adapters

Use the file-backed adapter for durable state:

```ts
const sessionsAdapter = createFileSessionsAdapter();
const sessionManager = createSessionManager(sessionsAdapter);
```

Use the memory-backed adapter for ephemeral or test flows:

```ts
const sessionManager = createSessionManager(new InMemorySessionsAdapter());
```

Default rule:

- durable application flow -> file sessions
- ephemeral run or test -> memory sessions

## Core Public Workflow

The main `SessionManager` operations are:

- `createSession(...)`
- `getSession(projectName, sessionId, path?)`
- `listSessions(projectName, path?)`
- `getMessages(projectName, sessionId, branch?, path?)`
- `getLatestNode(projectName, sessionId, branch?, path?)`
- `appendMessage(...)`

Keep most application code on `SessionManager` instead of working directly against adapter internals.

## Core Types

The most useful session types for app code are:

- `Session`
- `SessionHeader`
- `SessionNode`
- `MessageNode`
- `SessionSummary`

Treat sessions as stored message trees, but keep normal persistence flows focused on the main branch unless the task explicitly needs branching.

## Canonical Conversation Persistence Pattern

This is the default pattern for saving and loading a `Conversation`.

### 1. Create or load a session

```ts
const sessionManager = createSessionManager(createFileSessionsAdapter());

const created = await sessionManager.createSession({
  projectName: 'my-project',
  path: 'agents',
  sessionName: 'Support Chat',
});

const sessionId = created.sessionId;
```

If the caller already has a session id, skip `createSession(...)` and load that session instead.

### 2. Load prior messages

```ts
const existingNodes = await sessionManager.getMessages('my-project', sessionId, 'main', 'agents');

const existingMessages = (existingNodes ?? []).map((node) => node.message);
```

### 3. Hydrate a `Conversation`

```ts
const model = getModel('anthropic', 'claude-haiku-4-5');
if (!model) {
  throw new Error('Model not found');
}

const conversation = new Conversation({
  keysAdapter: createFileKeysAdapter(),
});

conversation.setProvider({ model });
conversation.replaceMessages(existingMessages);
```

### 4. Persist appended messages

```ts
const latestNode = await sessionManager.getLatestNode('my-project', sessionId, 'main', 'agents');

let parentId = latestNode?.id ?? created.header.id;

const persistMessage: ConversationExternalCallback = async (message) => {
  const result = await sessionManager.appendMessage({
    projectName: 'my-project',
    path: 'agents',
    sessionId,
    parentId,
    branch: 'main',
    message,
    api: conversation.state.provider.model.api,
    modelId: conversation.state.provider.model.id,
  });

  parentId = result.node.id;
};

await conversation.prompt('Summarize the last ticket.', undefined, persistMessage);
```

This keeps the in-memory `Conversation` and stored session history aligned through the public SDK surface.

## Practical Notes

- Use `replaceMessages(...)` with stored `MessageNode.message` values when rehydrating.
- Use `getLatestNode(...)` to establish the correct parent before persisting the next message.
- Keep the persistence callback branch explicit, usually `'main'`, unless the task explicitly needs branch management.
- Prefer session-backed persistence over ad hoc JSON files for saved conversation history.
