# Testing And Release

## Local Validation

Run the full local release check with:

```bash
pnpm --filter @ank1015/llm-sdk release:check
```

This executes:

1. `build`
2. `typecheck`
3. `lint`
4. `test:unit`
5. `test:coverage`

## Live Integration Tests

The live integration suite is separate because it calls real providers.

```bash
pnpm --filter @ank1015/llm-sdk test:integration
```

Today the integration coverage is focused on the OpenAI-backed `llm()` and `agent()` flows. The suite reads `OPENAI_API_KEY`, writes a temporary keys file, and skips when the credential is not available.

## Packaging

Create a release tarball preview with:

```bash
cd packages/sdk
npm pack --dry-run
```

`prepack` runs `release:check`, so tarball creation also validates the package before packaging.

## Publish Checklist

Before publishing `@ank1015/llm-sdk`, verify:

1. `README.md`, `CHANGELOG.md`, `LICENSE`, and `docs/` reflect the current public API.
2. `release:check` passes locally.
3. `test:integration` was run for the provider coverage you intend to claim in the release notes.
4. `npm pack --dry-run` includes the expected package artifacts and rewrites workspace dependencies to published semver ranges.
5. A fresh temp-project install can import the package root and the documented subpath exports you expect users to rely on.
6. The package version and changelog entry match the intended release.
7. Publish is performed with `pnpm`, which is enforced by `prepublishOnly`.
