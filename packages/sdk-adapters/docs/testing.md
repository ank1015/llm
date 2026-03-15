# Testing and Release Checks

This package owns concrete adapter implementation tests.

## Covered Here

- file-system keys adapter behavior
- file-system sessions adapter behavior
- in-memory keys adapter behavior
- in-memory sessions adapter behavior
- `SessionManager` compatibility against the concrete file sessions adapter

## Does Not Belong Here

- sdk wrapper behavior for `complete()`, `stream()`, or `Conversation`
- provider integration tests
- usage-tracking adapter tests
- UI or HTTP endpoint tests

## Commands

- `pnpm build`
- `pnpm test`
- `pnpm test:unit`
- `pnpm test:integration`
- `pnpm test:coverage`
- `pnpm typecheck`
- `pnpm lint`

## Release Checks

Before publishing:

- `lint` must pass
- `typecheck` must pass
- `build` must emit a clean `dist/`
- `test:unit` and `test:integration` must pass
- `npm pack --dry-run` must include `README.md`, `CHANGELOG.md`, and `LICENSE`
- the tarball must not contain stale `keys-ui`, `sqlite-usage`, or `memory-usage` artifacts
