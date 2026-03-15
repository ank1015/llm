# Testing

## Commands

- `pnpm --filter @ank1015/llm-server lint`
- `pnpm --filter @ank1015/llm-server typecheck`
- `pnpm --filter @ank1015/llm-server build`
- `pnpm --filter @ank1015/llm-server test:unit`
- `pnpm --filter @ank1015/llm-server test:integration`
- `pnpm --filter @ank1015/llm-server test:coverage`

## Test Layout

- `tests/unit`
  - core domain objects
  - session runtime behavior with mocked SDK calls
  - credential utility tests
  - regression checks for retired server/skill plumbing
- `tests/integration`
  - `/health`
  - project routes
  - artifact-dir routes
  - session routes
  - skill routes

## What The Tests Validate

- project and artifact metadata persistence
- artifact file explorer, file-read, rename, and delete behavior
- session creation, history, branching, retry, edit, and streaming
- SSE replay, cancellation, and duplicate-run protection
- bundled skill listing and artifact-local skill installation/deletion
- credential reload helper failure paths

## Packaging Validation

Before publishing, also run:

```bash
cd packages/server && npm pack --dry-run
```

Check that the tarball:

- includes `dist/`, `docs/`, `README.md`, `CHANGELOG.md`, and `LICENSE`
- excludes stale files from removed architectures
- reflects the current source tree after a clean build
