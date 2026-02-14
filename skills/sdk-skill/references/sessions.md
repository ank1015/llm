# Session Management

Sessions provide persistent, branching conversation history using an append-only tree model.

## Setup

```ts
import { createSessionManager } from '@ank1015/llm-sdk';
import { createFileSessionsAdapter } from '@ank1015/llm-sdk-adapters';

const sessionManager = createSessionManager(createFileSessionsAdapter());
```

## Create a Session

```ts
const { sessionId, header } = await sessionManager.createSession({
  projectName: 'my-app',
  path: 'chats', // optional subdirectory
  sessionName: 'Bug fix discussion',
});
// header.id is the root node ID (parentId for first message)
```

## Append Messages

```ts
const { node } = await sessionManager.appendMessage({
  projectName: 'my-app',
  path: 'chats',
  sessionId,
  parentId: header.id, // attach to root
  branch: 'main',
  message: userMessage, // any Message type
  api: 'anthropic',
  modelId: 'claude-sonnet-4-5',
  providerOptions: {},
});
// node.id is the new node's ID — use as parentId for next message
```

### Auto-create Session

If `sessionId` is omitted, `appendMessage` creates a new session automatically:

```ts
const { sessionId, node } = await sessionManager.appendMessage({
  projectName: 'my-app',
  path: '',
  parentId: 'auto', // will create header
  branch: 'main',
  message,
  api: 'anthropic',
  modelId: 'claude-sonnet-4-5',
});
```

## Tree Structure

Sessions form a tree. Each node has a `parentId` and `branch`.

```
SessionHeader (root, branch: 'main', parentId: null)
  ├── MessageNode (user msg, branch: 'main')
  │   └── MessageNode (assistant msg, branch: 'main')
  │       ├── MessageNode (user msg, branch: 'main')     ← continue main
  │       └── MessageNode (user msg, branch: 'retry-1')  ← branch off
  └── CustomNode (metadata, branch: 'main')
```

## Query Sessions

```ts
// List all sessions in a project
const sessions = await sessionManager.listSessions('my-app', 'chats');

// Get full session (header + all nodes)
const session = await sessionManager.getSession('my-app', sessionId, 'chats');

// Get messages only (ordered)
const messages = await sessionManager.getMessages('my-app', sessionId, 'main', 'chats');

// List all projects
const projects = await sessionManager.listProjects();

// Search sessions by name
const results = await sessionManager.searchSessions('my-app', 'bug fix');
```

## Branching

```ts
// Get all branches in a session
const branches = await sessionManager.getBranches('my-app', sessionId);
// BranchInfo[] — { name, branchPointId, nodeCount, latestNodeId }

// Get linear history of a specific branch
const history = await sessionManager.getBranchHistory('my-app', sessionId, 'main');

// Get a specific node
const node = await sessionManager.getNode('my-app', sessionId, nodeId);

// Get latest node (optionally on a branch)
const latest = await sessionManager.getLatestNode('my-app', sessionId, 'main');
```

## Custom Nodes

Store arbitrary metadata in the session tree:

```ts
const customNode = await sessionManager.appendCustom({
  projectName: 'my-app',
  path: 'chats',
  sessionId,
  parentId: lastNodeId,
  branch: 'main',
  payload: { type: 'model_switch', from: 'gpt-5.2', to: 'claude-sonnet-4-5' },
});
```

## Other Operations

```ts
await sessionManager.updateSessionName('my-app', sessionId, 'New name');
await sessionManager.deleteSession('my-app', sessionId);
```

## Wiring Conversation + SessionManager

Use the `externalCallback` parameter on `prompt()`/`continue()` to persist every message as it's appended:

```ts
import { Conversation, createSessionManager, getModel } from '@ank1015/llm-sdk';
import { createFileSessionsAdapter, createFileKeysAdapter } from '@ank1015/llm-sdk-adapters';

const sm = createSessionManager(createFileSessionsAdapter());
const convo = new Conversation({ keysAdapter: createFileKeysAdapter() });
convo.setProvider({ model: getModel('anthropic', 'claude-sonnet-4-5')! });

// Create session
const { sessionId, header } = await sm.createSession({ projectName: 'my-app' });
let lastNodeId = header.id;

// Run prompt with persistence callback
await convo.prompt('Hello', undefined, async (message) => {
  const { node } = await sm.appendMessage({
    projectName: 'my-app',
    path: '',
    sessionId,
    parentId: lastNodeId,
    branch: 'main',
    message,
    api: convo.state.provider.model.api,
    modelId: convo.state.provider.model.id,
  });
  lastNodeId = node.id;
});
```

## SessionSummary Shape

Returned by `listSessions()` and `searchSessions()`:

```ts
interface SessionSummary {
  sessionId: string;
  sessionName: string;
  filePath: string;
  createdAt: string; // ISO 8601
  updatedAt: string;
  nodeCount: number;
  branches: string[];
}
```
