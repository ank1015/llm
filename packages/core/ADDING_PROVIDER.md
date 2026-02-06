# Adding a New Provider

This guide walks through every file you need to create or modify when adding a new provider. The examples use a hypothetical provider called `acme`.

## Overview

The project uses a **self-registering provider system**. Each provider registers its stream function and mock message factory when its `index.ts` is imported. The central registry dispatches to the correct implementation at runtime.

**Files to create:** 4
**Files to modify:** 6

---

## Step 1: Define types (`packages/types/`)

### 1a. Add to KnownApis

**File:** `packages/types/src/api.ts`

Add the provider string to the `KnownApis` array:

```typescript
export const KnownApis = [
  'openai',
  'google',
  'deepseek',
  'anthropic',
  'zai',
  'kimi',
  'acme', // <-- add here
] as const;
```

The `Api` union type is derived from this automatically.

### 1b. Create provider type file (NEW)

**File:** `packages/types/src/providers/acme.ts`

For an **OpenAI-compatible** provider (Chat Completions API):

```typescript
import type {
  ChatCompletion,
  ChatCompletionCreateParamsBase,
} from 'openai/resources/chat/completions.js';

export type AcmeNativeResponse = ChatCompletion;

interface AcmeProps {
  apiKey: string;
  signal?: AbortSignal;
}

export type AcmeProviderOptions = Omit<ChatCompletionCreateParamsBase, 'model' | 'messages'> &
  AcmeProps;
```

For a **native SDK** provider, import the SDK's response type instead of `ChatCompletion` and define options to match the SDK's params. See `anthropic.ts` or `google.ts` for examples.

### 1c. Register in provider maps

**File:** `packages/types/src/providers/index.ts`

Three changes:

```typescript
// 1. Import
import type { AcmeNativeResponse, AcmeProviderOptions } from './acme.js';

// 2. Re-export
export type { AcmeNativeResponse, AcmeProviderOptions } from './acme.js';

// 3. Add to both maps
export interface ApiNativeResponseMap {
  // ... existing entries ...
  acme: AcmeNativeResponse;
}

export interface ApiOptionsMap {
  // ... existing entries ...
  acme: AcmeProviderOptions;
}
```

### 1d. Re-export from package barrel

**File:** `packages/types/src/index.ts`

Add to the provider types export block:

```typescript
export type {
  // ... existing exports ...
  AcmeNativeResponse,
  AcmeProviderOptions,
} from './providers/index.js';
```

---

## Step 2: Implement the provider (`packages/core/src/providers/acme/`)

### 2a. Create `utils.ts`

**File:** `packages/core/src/providers/acme/utils.ts`

This file contains the message builder, param builder, and mock message factory.

For **OpenAI-compatible** providers, you can reuse the shared Chat Completions utilities:

```typescript
import { sanitizeSurrogates } from '../../utils/sanitize-unicode.js';
import { convertChatTools, createMockChatCompletion } from '../utils/index.js';

import type { ChatCompletion } from 'openai/resources/chat/completions.js';
// ... other OpenAI types as needed

import type { Context, Model, AcmeProviderOptions } from '@ank1015/llm-types';

export function getMockAcmeMessage(modelId: string, requestId: string): ChatCompletion {
  return createMockChatCompletion(modelId, requestId);
}

export function buildParams(model: Model<'acme'>, context: Context, options: AcmeProviderOptions) {
  const messages = buildAcmeMessages(model, context);
  const { apiKey, signal, ...providerOptions } = options;
  // ... build and return params
}

export function buildAcmeMessages(_model: Model<'acme'>, context: Context) {
  // Convert Context messages to provider-native format.
  // See deepseek/utils.ts or kimi/utils.ts for complete examples.
}
```

For **native SDK** providers, implement these from scratch. See `anthropic/utils.ts` or `google/utils.ts`.

### 2b. Create `stream.ts`

**File:** `packages/core/src/providers/acme/stream.ts`

For **OpenAI-compatible** providers:

```typescript
import {
  createChatCompletionClient,
  createChatCompletionStream,
  mapChatStopReason,
} from '../utils/index.js';
import { buildParams } from './utils.js';

import type { StreamFunction } from '../../utils/types.js';
import type { Context, Model, AcmeProviderOptions } from '@ank1015/llm-types';

export const streamAcme: StreamFunction<'acme'> = (
  model: Model<'acme'>,
  context: Context,
  options: AcmeProviderOptions,
  id: string
) => {
  const client = createChatCompletionClient(model, options.apiKey, 'Acme');
  const params = buildParams(model, context, options);

  return createChatCompletionStream(
    { mapStopReason: mapChatStopReason },
    client,
    params,
    model,
    context,
    options?.signal,
    id
  );
};
```

For **native SDK** providers, create the `AssistantMessageEventStream` manually and handle streaming events. See `anthropic/stream.ts` or `google/stream.ts`.

### 2c. Create `index.ts` (self-registration)

**File:** `packages/core/src/providers/acme/index.ts`

```typescript
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

This is the key file. Importing it triggers registration — no other files need to know about the registry.

---

## Step 3: Wire it up

### 3a. Export from core barrel

**File:** `packages/core/src/index.ts`

Add one line to the Providers section:

```typescript
// Providers
export * from './providers/anthropic/index.js';
export * from './providers/openai/index.js';
export * from './providers/google/index.js';
export * from './providers/deepseek/index.js';
export * from './providers/zai/index.js';
export * from './providers/kimi/index.js';
export * from './providers/acme/index.js'; // <-- add
```

This `export *` triggers the side-effect import of `acme/index.ts`, which calls `registerProvider()`.

### 3b. Add to test setup

**File:** `packages/core/vitest.setup.ts`

```typescript
import './src/providers/acme/index.js';
```

Tests import directly from source (not the barrel), so this ensures registration happens before any test runs.

---

## Step 4: Add models

**File:** `packages/core/src/models.generated.ts`

Add a base URL constant and model entries:

```typescript
const acmeBaseUrl = `https://api.acme.com/v1`;

export const MODELS = {
  // ... existing providers ...

  acme: {
    'acme-model-1': {
      id: 'acme-model-1',
      name: 'Acme Model 1',
      api: 'acme',
      baseUrl: acmeBaseUrl,
      reasoning: false,
      input: ['text'],
      cost: {
        input: 0.5,
        output: 1.5,
        cacheRead: 0.1,
        cacheWrite: 0,
      },
      contextWindow: 128000,
      maxTokens: 8192,
      tools: ['function_calling'],
    } satisfies Model<'acme'>,
  },
} as const;
```

---

## File Checklist

| #   | File                                | Action                                                    |
| --- | ----------------------------------- | --------------------------------------------------------- |
| 1   | `types/src/api.ts`                  | Add to `KnownApis`                                        |
| 2   | `types/src/providers/acme.ts`       | **Create** — native response + options types              |
| 3   | `types/src/providers/index.ts`      | Import, re-export, add to both maps                       |
| 4   | `types/src/index.ts`                | Re-export new types                                       |
| 5   | `core/src/providers/acme/utils.ts`  | **Create** — message builder, param builder, mock factory |
| 6   | `core/src/providers/acme/stream.ts` | **Create** — streaming implementation                     |
| 7   | `core/src/providers/acme/index.ts`  | **Create** — self-registration + re-exports               |
| 8   | `core/src/index.ts`                 | Add `export *` line                                       |
| 9   | `core/vitest.setup.ts`              | Add side-effect import                                    |
| 10  | `core/src/models.generated.ts`      | Add base URL + model entries                              |

**Files that never need touching:** `registry.ts`, `mock.ts`, `stream.ts` (central), `complete.ts`

---

## Verification

```bash
# From project root
pnpm typecheck          # No type errors
pnpm --filter core test # All tests pass
```

The exhaustive `Api` union type will cause compile errors anywhere a switch/map doesn't handle the new provider, guiding you to any spots you missed.
