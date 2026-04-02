# Testing And Release

## Local Validation

Run the full local release check with:

```bash
pnpm --filter @ank1015/llm-core release:check
```

This executes:

1. `build`
2. `typecheck`
3. `lint`
4. `test:unit`
5. `test:coverage`

## Live Integration Tests

The integration suite is intentionally separate because it exercises real providers and file-input behavior.

```bash
pnpm --filter @ank1015/llm-core test:integration
```

The helper in `tests/integration/helpers/live.ts` skips suites when their credentials are not available, so local runs can still succeed in partial environments.

## Packaging

Create a release tarball preview with:

```bash
cd packages/core
npm pack --dry-run
```

`prepack` runs `release:check`, so tarball creation also validates the package before packaging.

## Publish Checklist

Before publishing `@ank1015/llm-core`, verify:

1. `README.md`, `CHANGELOG.md`, `LICENSE`, and `docs/` reflect the current public API.
2. `release:check` passes locally.
3. Live integration tests were run for the provider set you intend to support in the release notes.
4. `npm pack --dry-run` includes the expected package artifacts.
5. The package version and changelog entry match the intended release.
6. Publish is performed with `pnpm`, which is enforced by `prepublishOnly`.
