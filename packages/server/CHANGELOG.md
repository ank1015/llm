# Changelog

## 0.0.3 - 2026-03-16

- adopt `@ank1015/llm-app-contracts` as the intentional HTTP contract layer for server DTOs, request/query validation, and SSE payloads
- update routes, tests, and API docs to use cleaned public DTOs instead of leaking internal server metadata
- align the app clients to the shared contract package so the server boundary is consistent across web and native

## 0.0.2 - 2026-03-15

- remove the retired X/research/SQLite subsystem from the package
- clean the build so `dist/` matches the live source tree
- reorganize tests into `tests/unit` and `tests/integration`
- refresh package docs, API docs, metadata, and publish surface
