# Adding a New Provider

This guide walks through the current provider flow for `@ank1015/llm-core`. The examples use a hypothetical provider called `acme`.

## Overview

The package uses a self-registering provider system:

1. `packages/types` defines the provider contract.
2. `packages/core/src/providers/<name>/index.ts` registers the runtime implementation.
3. `packages/core/src/index.ts` re-exports that provider, which triggers registration for normal consumers.
4. `packages/core/vitest.setup.ts` imports the provider directly so tests register it before execution.

For most providers, you will touch both `packages/types` and `packages/core`.

## Step 1: define the contracts in `packages/types`

### 1a. Add the API name

File: `packages/types/src/api.ts`

Add your provider to `KnownApis`:

```ts
export const KnownApis = [
  'openai',
  'google',
  'deepseek',
  'anthropic',
  'codex',
  'claude-code',
  'zai',
  'kimi',
  'minimax',
  'cerebras',
  'openrouter',
  'acme',
] as const;
```

### 1b. Add provider-native types

File: `packages/types/src/providers/acme.ts`

Choose the native response and options shape that matches the real provider:

- OpenAI chat-completions style: use `ChatCompletion` and `ChatCompletionCreateParamsBase`
- OpenAI Responses style: use `Response` and `ResponseCreateParamsBase`
- Anthropic style: use `Message` and `MessageCreateParamsNonStreaming`
- Native SDK: use the provider SDK's own types

### 1c. Wire the provider maps

File: `packages/types/src/providers/index.ts`

Add:

- imports for `AcmeNativeResponse` and `AcmeProviderOptions`
- re-exports
- `acme` entries in `ApiNativeResponseMap`
- `acme` entries in `ApiOptionsMap`

### 1d. Re-export from the package barrel

File: `packages/types/src/index.ts`

Re-export the new provider types so downstream consumers can import them from the package root.

## Step 2: implement the runtime in `packages/core`

Create `packages/core/src/providers/acme/` with:

- `index.ts`
- `stream.ts`
- `utils.ts`

### 2a. `utils.ts`

This file usually contains:

- client creation
- request param building
- context-to-provider message conversion
- stop-reason mapping
- mock native message generation

Pick the closest existing provider as a template:

- `anthropic/` for native Anthropic streams
- `minimax/` for Anthropic-wire providers
- `openai/` for native OpenAI Responses streams
- `codex/` for OpenAI Responses proxy providers
- `google/` for Gemini native streams and image events
- `deepseek/`, `kimi/`, `zai/`, `cerebras/`, or `openrouter/` for shared chat-completions providers

### 2b. `stream.ts`

Every provider implements a stream function.

Common patterns:

- Native custom stream: manually build `AssistantMessageEventStream`
- Shared OpenAI chat-completions stream: reuse `createChatCompletionStream()`
- Anthropic-wire stream: follow `anthropic` or `minimax`
- OpenAI Responses stream: follow `openai` or `codex`

### 2c. `index.ts`

Register the provider at module scope:

```ts
import { registerProvider } from '../registry.js';
import { streamAcme } from './stream.js';
import { getMockAcmeMessage } from './utils.js';

registerProvider('acme', {
  stream: streamAcme,
  getMockNativeMessage: getMockAcmeMessage,
});

export { streamAcme } from './stream.js';
export { getMockAcmeMessage } from './utils.js';
```

## Step 3: wire the provider into the package

### 3a. Export it from the public barrel

File: `packages/core/src/index.ts`

Add:

```ts
export * from './providers/acme/index.js';
```

This export is required for normal package consumers because it triggers the side-effect registration.

### 3b. Register it in tests

File: `packages/core/vitest.setup.ts`

Add:

```ts
import './src/providers/acme/index.js';
```

## Step 4: add models

Create a provider-specific model file:

File: `packages/core/src/models/acme.ts`

```ts
import type { Model } from '@ank1015/llm-types';

const acmeBaseUrl = `https://api.acme.com/v1`;

export const acmeModels = {
  'acme-model-1': {
    id: 'acme-model-1',
    name: 'Acme Model 1',
    api: 'acme',
    baseUrl: acmeBaseUrl,
    reasoning: true,
    input: ['text'],
    cost: {
      input: 1,
      output: 2,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 128000,
    maxTokens: 8192,
    tools: ['function_calling'],
  } satisfies Model<'acme'>,
};
```

Then wire it into:

File: `packages/core/src/models/index.ts`

```ts
import { acmeModels } from './acme.js';

export const MODELS = {
  // existing providers...
  acme: acmeModels,
};
```

## Current built-in providers

Use these as references when choosing the nearest implementation pattern:

- `anthropic`
- `claude-code`
- `openai`
- `codex`
- `google`
- `deepseek`
- `kimi`
- `zai`
- `cerebras`
- `openrouter`
- `minimax`

## File checklist

| #   | File                                         | Action                                      |
| --- | -------------------------------------------- | ------------------------------------------- |
| 1   | `packages/types/src/api.ts`                  | Add to `KnownApis`                          |
| 2   | `packages/types/src/providers/acme.ts`       | Create provider-native response and options |
| 3   | `packages/types/src/providers/index.ts`      | Import, re-export, and add map entries      |
| 4   | `packages/types/src/index.ts`                | Re-export new provider types                |
| 5   | `packages/core/src/providers/acme/utils.ts`  | Create runtime helpers                      |
| 6   | `packages/core/src/providers/acme/stream.ts` | Create stream implementation                |
| 7   | `packages/core/src/providers/acme/index.ts`  | Register provider and re-export             |
| 8   | `packages/core/src/index.ts`                 | Add provider barrel export                  |
| 9   | `packages/core/vitest.setup.ts`              | Add test registration import                |
| 10  | `packages/core/src/models/acme.ts`           | Add provider models                         |
| 11  | `packages/core/src/models/index.ts`          | Add provider model catalog to `MODELS`      |

## Verification

From the monorepo root:

```bash
pnpm --filter @ank1015/llm-types typecheck
pnpm --filter @ank1015/llm-core lint
pnpm --filter @ank1015/llm-core typecheck
pnpm --filter @ank1015/llm-core test:unit
```

Then run targeted integration coverage if the provider needs live testing:

```bash
pnpm --filter @ank1015/llm-core exec vitest run tests/integration/acme
```

If the API union or provider maps are incomplete, TypeScript will usually point at the missing registrations quickly.
