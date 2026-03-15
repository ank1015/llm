# @ank1015/llm-sdk

Opinionated SDK layer over `@ank1015/llm-core`.

`@ank1015/llm-sdk` adds a higher-level application surface on top of the stateless `core` package:

- credential resolution via `KeysAdapter`
- stateful chat flows via `Conversation`
- session convenience via `SessionManager`

The package intentionally avoids concrete filesystem or database adapters so it can stay runtime-neutral. If you want ready-made Node implementations for keys or sessions, use the companion `@ank1015/llm-sdk-adapters` package.

## Install

```bash
npm install @ank1015/llm-sdk
```

## Quick Start

```ts
import { complete, getModel } from '@ank1015/llm-sdk';

const model = getModel('anthropic', 'claude-haiku-4-5');

const response = await complete(
  model!,
  {
    messages: [
      {
        role: 'user',
        id: 'msg-1',
        timestamp: Date.now(),
        content: [{ type: 'text', content: 'Say hello and nothing else.' }],
      },
    ],
  },
  {
    providerOptions: {
      apiKey: process.env.ANTHROPIC_API_KEY!,
      max_tokens: 128,
    },
  }
);
```

## Main APIs

### `complete()` and `stream()`

The sdk wrappers keep the `core` request model but add shared credential resolution through `keysAdapter`.

Credential resolution precedence:

1. explicit credential fields in `providerOptions`
2. `keysAdapter.getCredentials(api)` when present
3. `keysAdapter.get(api)` for `apiKey`
4. throw if required credentials are still missing

This is especially useful for multi-field providers such as `codex` and `claude-code`.

### `Conversation`

```ts
import { Conversation, getModel } from '@ank1015/llm-sdk';

const conversation = new Conversation({
  costLimit: 1,
  streamAssistantMessage: true,
});

conversation.setProvider({
  model: getModel('openai', 'gpt-5.2')!,
  providerOptions: { apiKey: process.env.OPENAI_API_KEY! },
});

const messages = await conversation.prompt('Summarize the last two messages.');
```

### `SessionManager`

```ts
import { createSessionManager, type SessionsAdapter } from '@ank1015/llm-sdk';

declare const sessionsAdapter: SessionsAdapter;

const sessions = createSessionManager(sessionsAdapter);

const { sessionId } = await sessions.createSession({
  projectName: 'demo',
  sessionName: 'First Session',
});

const session = await sessions.getSession('demo', sessionId);
```

## Package Boundaries

- `@ank1015/llm-types` defines the shared contracts
- `@ank1015/llm-core` implements the stateless provider runtime
- `@ank1015/llm-sdk` adds opinionated wrappers and state
- `@ank1015/llm-sdk-adapters` owns concrete Node-oriented adapter implementations

The sdk package itself does not require Node built-ins. Environment compatibility follows the underlying `core` provider/runtime support.

## Docs

- [Package Docs](./docs/README.md)
- [Adapter Boundaries](./docs/adapters.md)
- [Testing and Ownership](./docs/testing.md)

## Development

- `pnpm build`
- `pnpm test`
- `pnpm test:unit`
- `pnpm test:integration`
- `pnpm test:coverage`
- `pnpm typecheck`
- `pnpm lint`
