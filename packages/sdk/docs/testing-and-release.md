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

Gateway integration coverage reads `~/.llm/gateway.json` by default, refreshes the gateway access token, and verifies real `llm()` responses through both `openai/...` and `azure-openai/...` model routes. Set `LLM_GATEWAY_CREDENTIALS_PATH` to point at a different gateway credential file.

Image gateway integration is opt-in because it creates real image output. Set `LLM_SDK_IMAGE_GATEWAY_INTEGRATION=1` to run the live image test.

Direct-provider integration coverage is still available for provider-key paths. Those tests set `modelTransport: 'direct'`, read provider env vars such as `OPENAI_API_KEY`, write temporary keys files, and skip when the required credential is not available.

## Packaging

Create a release tarball preview with:

```bash
cd packages/sdk
pnpm publish --dry-run --no-git-checks
```

This exercises the real `pnpm` publish path, prints the tarball contents, and keeps the workspace dependency rewrite that `prepublishOnly` enforces for releases.

If you need to inspect the rewritten packed manifest directly, create a tarball with `pnpm` and read the packaged `package.json`:

```bash
mkdir -p /tmp/llm-sdk-pack
cd packages/sdk
pnpm pack --pack-destination /tmp/llm-sdk-pack
tar -xOf /tmp/llm-sdk-pack/*.tgz package/package.json
```

`prepack` runs `release:check`, so tarball creation also validates the package before packaging.

## Publish Checklist

Before publishing `@ank1015/llm-sdk`, verify:

1. `README.md`, `CHANGELOG.md`, `LICENSE`, and `docs/` reflect the current public API.
2. `release:check` passes locally.
3. `test:integration` was run for the provider coverage you intend to claim in the release notes.
4. A `pnpm publish --dry-run --no-git-checks` preview includes the expected package artifacts, and a `pnpm pack` tarball shows workspace dependencies rewritten to published semver ranges.
5. A fresh temp-project install can import the package root and the documented subpath exports you expect users to rely on.
6. The package version and changelog entry match the intended release.
7. Publish is performed with `pnpm`, which is enforced by `prepublishOnly`.
