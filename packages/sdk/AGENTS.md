# @ank1015/llm-sdk

Opinionated SDK layer over `@ank1015/llm-core`.

This package owns the higher-level application surface:

- credential resolution through `KeysAdapter`
- stateful conversations via `Conversation`
- session convenience via `SessionManager`
- selected re-exports from `core` and `types`

It should stay runtime-neutral. Concrete filesystem/database adapters belong in the companion `@ank1015/llm-sdk-adapters` package, not here.

## Commands

- `pnpm build` — clean `dist/` and compile TypeScript
- `pnpm dev` — watch mode compilation
- `pnpm test` — run unit and integration tests
- `pnpm test:unit` — run unit tests
- `pnpm test:integration` — run integration tests (skips suites without credentials)
- `pnpm test:coverage` — run unit tests with coverage
- `pnpm typecheck` — type-check without emitting
- `pnpm lint` — run ESLint for the package
- `pnpm clean` — remove build output and coverage

## Structure

```text
src/
  index.ts                — public exports
  adapters/
    index.ts              — adapter contracts re-exported from @ank1015/llm-types
  llm/
    complete.ts           — complete() with credential resolution
    stream.ts             — stream() with credential resolution
    index.ts              — llm exports
  agent/
    conversation.ts       — stateful wrapper around core's runAgentLoop
    index.ts              — agent exports
  session/
    session-manager.ts    — convenience wrapper around SessionsAdapter
    index.ts              — session exports
  utils/
    resolve-key.ts        — shared credential-resolution logic

docs/
  README.md               — docs index
  adapters.md             — package boundaries and adapter expectations
  testing.md              — test ownership and commands

tests/
  unit/
    llm/                  — complete/stream wrapper behavior
    conversation/         — state and execution behavior
    session/              — SessionManager delegation
  integration/
    complete.test.ts      — complete() with live providers
    stream.test.ts        — stream() with live providers
    conversation/         — end-to-end conversation flows and budgets
```

## Key Behavior

### Credential Resolution

`complete()`, `stream()`, and `Conversation` all use the same precedence:

1. explicit credential fields in `providerOptions`
2. `keysAdapter.getCredentials(api)` when available
3. `keysAdapter.get(api)` for `apiKey`
4. throw if required fields are still missing

This matters for providers with multiple credential fields such as `codex` and `claude-code`.

### Main Exports

- `complete(model, context, options?)`
- `stream(model, context, options?)`
- `Conversation`
- `SessionManager`, `createSessionManager(adapter)`
- `resolveApiKey()`, `resolveProviderCredentials()`
- selected `@ank1015/llm-core` and `@ank1015/llm-types` re-exports

### Package Boundary

- `sdk` owns contracts, wrappers, and stateful helpers
- `sdk-adapters` owns concrete Node-oriented implementations and their implementation tests
- provider/runtime coverage follows the current `@ank1015/llm-core` model catalog

## Usage Examples

### Direct Provider Options

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
        content: [{ type: 'text', content: 'Say hello.' }],
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

### Conversation

```ts
import { Conversation, getModel } from '@ank1015/llm-sdk';

const conversation = new Conversation();

conversation.setProvider({
  model: getModel('openai', 'gpt-5.2')!,
  providerOptions: { apiKey: process.env.OPENAI_API_KEY! },
});

const newMessages = await conversation.prompt('Plan a weekend trip.');
```

### Session Manager

```ts
import { createSessionManager, type SessionsAdapter } from '@ank1015/llm-sdk';

declare const sessionsAdapter: SessionsAdapter;

const sessions = createSessionManager(sessionsAdapter);
const created = await sessions.createSession({
  projectName: 'demo',
  sessionName: 'First Session',
});
```

## Testing

- sdk unit tests should cover wrapper behavior only
- adapter implementation tests belong in `sdk-adapters`
- live integration tests in this package should use sdk-owned entry points only

Environment variables commonly used by integration tests:

- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `GEMINI_API_KEY`
- `DEEPSEEK_API_KEY`
- `KIMI_API_KEY`
- `ZAI_API_KEY`

## Conventions

- Keep `src/` free of Node-specific persistence code
- Do not add concrete adapter implementations here
- Keep `Conversation` stateful and `core` stateless
- Mock `@ank1015/llm-core` in sdk unit tests when testing wrapper behavior
- Prefer current live model IDs from `core` in docs and examples

## Dependencies

- Depends on: `@ank1015/llm-core`, `@ank1015/llm-types`
- Companion package: `@ank1015/llm-sdk-adapters`
