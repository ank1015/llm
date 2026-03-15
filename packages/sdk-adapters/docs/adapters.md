# Adapter Details

`@ank1015/llm-sdk-adapters` is the concrete storage package for the SDK layer.

## What Lives Here

- `FileKeysAdapter` for encrypted credential storage on disk
- `FileSessionsAdapter` for append-only JSONL session storage
- `InMemoryKeysAdapter` for tests and lightweight local flows
- `InMemorySessionsAdapter` for tests and lightweight local flows

## What Does Not Live Here

- usage tracking adapters
- browser-facing helpers
- key-management UI or server endpoints
- higher-level wrappers like `Conversation` or `SessionManager`

Those belong in other packages:

- `sdk` owns adapter-consuming wrappers
- `server` can own server-side credential utilities
- `types` owns the contracts

## Internal Layout

- `src/file-system/` contains Node persistence adapters
- `src/memory/` contains in-memory implementations
- `src/shared/` contains small shared helpers reused across adapter families

The public API still comes only from the root `src/index.ts`.

## Behavior Notes

- `FileKeysAdapter` keeps legacy single-key files and credential bundles in sync
- `FileSessionsAdapter` validates path components and guards against traversal
- Session adapters validate parent nodes before appending child nodes
- In-memory adapters are intentionally simple and persistence-free
