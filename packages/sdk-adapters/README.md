# @ank1015/llm-sdk-adapters

Concrete Node.js adapters for `@ank1015/llm-sdk`.

This package provides ready-made implementations for the adapter contracts defined in `@ank1015/llm-types` and consumed by `@ank1015/llm-sdk`:

- encrypted file-system key storage
- JSONL file-system session storage
- in-memory keys/session adapters for tests and lightweight local flows

It no longer includes usage-tracking adapters or key-management UI utilities.

## Install

```bash
npm install @ank1015/llm-sdk-adapters
```

## Main Exports

```ts
import {
  FileKeysAdapter,
  FileSessionsAdapter,
  InMemoryKeysAdapter,
  InMemorySessionsAdapter,
  createFileKeysAdapter,
  createFileSessionsAdapter,
} from '@ank1015/llm-sdk-adapters';
```

## Quick Start

```ts
import { createSessionManager } from '@ank1015/llm-sdk';
import { createFileKeysAdapter, createFileSessionsAdapter } from '@ank1015/llm-sdk-adapters';

const keysAdapter = createFileKeysAdapter();
const sessionsAdapter = createFileSessionsAdapter();
const sessionManager = createSessionManager(sessionsAdapter);
```

## Included Adapters

### File-system adapters

- `FileKeysAdapter`
  - stores encrypted credentials under `~/.llm/global/keys/`
  - supports both legacy `apiKey` storage and multi-field credential bundles
- `FileSessionsAdapter`
  - stores append-only JSONL sessions under `~/.llm/sessions/`
  - supports branching, custom nodes, and session summaries

### In-memory adapters

- `InMemoryKeysAdapter`
- `InMemorySessionsAdapter`

These are useful in tests or small local flows where persistence is not needed.

## Package Boundary

- `@ank1015/llm-types` defines the adapter contracts and shared errors
- `@ank1015/llm-sdk` provides the higher-level wrappers that consume these adapters
- `@ank1015/llm-sdk-adapters` owns the concrete Node-oriented implementations

## Docs

- [Package Docs](./docs/README.md)
- [Adapter Details](./docs/adapters.md)
- [Testing and Release Checks](./docs/testing.md)

## Development

- `pnpm build`
- `pnpm test`
- `pnpm test:unit`
- `pnpm test:integration`
- `pnpm test:coverage`
- `pnpm typecheck`
- `pnpm lint`
