# Setup, Keys, And Sessions

`@ank1015/llm-sdk` adds local configuration and persistence on top of `@ank1015/llm-core`.

## Default Paths

The SDK defaults are:

- keys file: `~/.llm-sdk/keys.env`
- sessions directory: `~/.llm-sdk/sessions`

They come from `@ank1015/llm-sdk/config`:

```ts
import {
  DEFAULT_KEYS_FILE_PATH,
  DEFAULT_SESSIONS_BASE_DIR,
  getSdkConfig,
  resetSdkConfig,
  setSdkConfig,
} from '@ank1015/llm-sdk/config';

console.log(DEFAULT_KEYS_FILE_PATH);
console.log(DEFAULT_SESSIONS_BASE_DIR);

setSdkConfig({
  keysFilePath: '/tmp/llm-sdk/keys.env',
  sessionsBaseDir: '/tmp/llm-sdk/sessions',
});

console.log(getSdkConfig());
resetSdkConfig();
```

## Keys File Helpers

Use `@ank1015/llm-sdk/keys` to read, write, or seed credentials:

```ts
import {
  getAvailableKeyProviders,
  getProviderCredentialSpec,
  readKeysFile,
  resolveProviderCredentials,
  setProviderCredentials,
} from '@ank1015/llm-sdk/keys';

await setProviderCredentials('/tmp/keys.env', 'openai', {
  apiKey: process.env.OPENAI_API_KEY!,
});

const values = await readKeysFile('/tmp/keys.env');
const availableProviders = await getAvailableKeyProviders('/tmp/keys.env');
const resolved = await resolveProviderCredentials('/tmp/keys.env', 'openai');
const spec = getProviderCredentialSpec('openai');

console.log(values, availableProviders, resolved, spec);
```

Credential fields used by the curated providers:

| Provider      | Required fields in `keys.env`                                                    |
| ------------- | -------------------------------------------------------------------------------- |
| `openai`      | `OPENAI_API_KEY`                                                                 |
| `codex`       | `CODEX_API_KEY`, `CODEX_CHATGPT_ACCOUNT_ID`                                      |
| `anthropic`   | `ANTHROPIC_API_KEY`                                                              |
| `claude-code` | `CLAUDE_CODE_OAUTH_TOKEN`, `CLAUDE_CODE_BETA_FLAG`, `CLAUDE_CODE_BILLING_HEADER` |
| `google`      | `GOOGLE_API_KEY`                                                                 |

Notes:

- `getAvailableKeyProviders()` lets callers inspect which providers are configured without reading or returning the secret values themselves.
- `setProviderCredentials()` writes the canonical env names for the provider.
- `resolveProviderCredentials()` returns a structured error instead of throwing when the file is missing or required fields are absent.
- `ANTHROPIC_API_KEYS` and `CHATGPT_ACCOUNT_ID` are still recognized as aliases when resolving existing files.

## Session Helpers

Use `@ank1015/llm-sdk/session` when you want direct access to the JSONL session layer that powers `agent()`.

```ts
import {
  appendSessionMessage,
  createSession,
  createSessionAppender,
  loadSessionMessages,
  readSession,
} from '@ank1015/llm-sdk/session';
import { userMessage } from '@ank1015/llm-sdk';

const session = await createSession({
  title: 'Release checklist',
});

await appendSessionMessage({
  path: session.path,
  message: userMessage('Summarize the repository state.'),
});

const loaded = await loadSessionMessages({ path: session.path });
const appender = await createSessionAppender({ path: session.path });

console.log(await readSession(session.path));
console.log(loaded?.messages.length, appender.headId);
```

Useful session exports:

- `createSessionPath()` to generate a new `.jsonl` path under the configured sessions directory
- `createSession()` / `ensureSession()` to initialize or reuse a session file
- `readSession()`, `getSessionNode()`, `getSessionHead()`, and `getSessionLineage()` for inspection
- `loadSessionMessages()` to turn a branch lineage into the `Message[]` view that `agent()` sees
- `appendSessionMessage()` and `appendSessionCustom()` for direct persistence
- `createSessionAppender()` for repeated appends without reloading the session file every time
- `listSessionBranches()` to inspect branch heads in a session tree

## How This Connects To `agent()`

`agent()` uses these same helpers internally:

1. resolve the configured keys file and curated model input
2. create or load a session
3. load existing messages from the chosen branch/head
4. append new messages and tool results as the run progresses

If you need custom storage, use `agent({ session: { loadMessages, saveNode } })` as documented in [agent.md](./agent.md).
