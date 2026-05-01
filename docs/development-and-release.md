# Development and Release

This repo has one main development surface and two release surfaces.

## Package Shape

Supporting packages:

- `packages/core` - provider runtime and model catalog
- `packages/sdk` - credential/session helpers and public `llm()` / `agent()` APIs
- `packages/agents` - shared tools, prompts, and agent utilities

Application packages:

- `packages/server` - Hono backend and main local runtime API
- `apps/web` - Next.js frontend for the local runtime

Release shells:

- `packages/app` - public `npx @ank1015/llm` launcher
- `apps/desktop` - Electron desktop app that embeds the server and web app

The product implementation should live in `packages/server` and `apps/web`. The npx and desktop packages should stay thin shells that assemble or embed that same implementation.

## Local Development

Run the backend and frontend in two terminals.

Terminal 1:

```bash
cd packages/server
pnpm dev
```

Terminal 2:

```bash
cd apps/web
pnpm dev
```

Defaults:

- server: `http://localhost:8001`
- web: Next.js dev server default, usually `http://localhost:3000`
- web API base in development: `http://localhost:8001`

Override the web API base when needed:

```bash
NEXT_PUBLIC_LLM_SERVER_BASE_URL=http://localhost:8001 pnpm dev
```

For supporting packages, use package-local watch/build commands:

```bash
cd packages/core && pnpm dev
cd packages/sdk && pnpm dev
cd packages/agents && pnpm dev
```

Or build the runtime packages from the repo root:

```bash
pnpm build:packages
```

## Validation

Common repo-level checks:

```bash
pnpm typecheck
pnpm test:unit
pnpm build
```

Focused checks are usually faster while developing:

```bash
pnpm --filter @ank1015/llm-server typecheck
pnpm --filter @ank1015/llm-server test:unit
pnpm --filter @ank1015/llm-web-app typecheck
pnpm --filter @ank1015/llm-web-app build
```

## Release Strategy 1: npx App

The npx release is `packages/app`, published as `@ank1015/llm`.

It packages:

- the built web app
- launcher code
- a dependency on the published `@ank1015/llm-server`

Before publishing, bump the version in every package that will be published. At minimum, bump `packages/app/package.json` for an npx release.

Build and smoke-test:

```bash
pnpm release:app:build
pnpm release:app:smoke
```

Create a local tarball:

```bash
pnpm release:app:pack
```

Publish only the npx app:

```bash
pnpm release:app:publish
```

Equivalent manual publish:

```bash
pnpm release:app:build
pnpm release:app:smoke
pnpm --dir packages/app publish
```

Important: if `packages/server` changed and the npx app needs that server change, publish `@ank1015/llm-server` first, then publish `@ank1015/llm`.

```bash
pnpm --dir packages/server publish
pnpm --dir packages/app publish
```

If supporting runtime packages changed, publish them before the app:

```bash
pnpm release:runtime:publish
pnpm --dir packages/app publish
```

Publish runtime packages and the npx app together:

```bash
pnpm release:publish
```

Post-publish checks:

```bash
npm dist-tag ls @ank1015/llm
npx -y @ank1015/llm@latest --host 127.0.0.1 --port 3212 --no-open
```

## Release Strategy 2: Desktop App

The desktop release is `apps/desktop`.

It embeds:

- the built Hono server from `packages/server`
- the built Next.js app from `apps/web`
- Electron shell/runtime code

Build the desktop app:

```bash
pnpm --filter @ank1015/llm-desktop-app build
```

Create an unpacked app for smoke testing:

```bash
pnpm --filter @ank1015/llm-desktop-app package
```

Create distributable binaries:

```bash
pnpm --filter @ank1015/llm-desktop-app dist
```

Outputs are written under:

```text
apps/desktop/release/
```

### Windows Release From GitHub Actions

The repo includes a Windows desktop release workflow:

```text
.github/workflows/desktop-windows-release.yml
```

Run it manually from GitHub Actions:

1. Open the `Desktop Windows Release` workflow.
2. Click `Run workflow`.
3. Optionally provide a `release_tag`, for example `desktop-v0.1.0`.
4. Leave `draft` enabled if you want to inspect the release before publishing.

If `release_tag` is empty, the workflow only uploads the Windows installer as a workflow artifact.

If `release_tag` is set, the workflow creates or updates that GitHub Release and uploads the Windows artifacts.

The workflow also runs automatically when pushing a tag matching:

```text
desktop-v*
```

Example:

```bash
git tag desktop-v0.1.0
git push origin desktop-v0.1.0
```

The Windows job builds on `windows-latest`, runs:

```bash
pnpm --filter @ank1015/llm-desktop-app dist
```

and uploads the generated installer files from:

```text
apps/desktop/release/
```

Useful focused checks:

```bash
pnpm --filter @ank1015/llm-desktop-app typecheck
pnpm --filter @ank1015/llm-desktop-app build
```

## Recommended Release Flow

For normal app development:

1. Make changes in `packages/server` and `apps/web`.
2. Validate with focused package checks.
3. Decide release target: npx, desktop, or both.
4. Bump versions for all packages being published.
5. Build and smoke-test the chosen release shell.
6. Publish or distribute.

For npx releases, remember that `packages/app` is not the server itself. It depends on `@ank1015/llm-server`, so server changes must be published as server releases before or alongside the app.

For desktop releases, no npm publish is required for the runtime packages. The desktop build embeds the current workspace build output.

## Future Improvement

Desktop development currently runs a production-style build before launching Electron:

```bash
pnpm dev:desktop-app
```

That is useful as a packaging smoke path, but it is slower than a live development loop. A future improvement would be a dedicated desktop live mode that starts Electron against:

- `packages/server` in dev mode
- `apps/web` in Next.js dev mode

That would keep daily development fast while preserving the production-style desktop build for release validation.
