# Server Configuration

The server package is configured through a small mix of process environment variables and runtime filesystem overrides.

## Network Defaults

`src/server.ts` uses these defaults when you start the package directly:

- `HOST=127.0.0.1`
- `PORT=8001`

If you do not set either variable, the local server binds only to localhost on port `8001`.

The `npx @ank1015/llm` launcher is different: it exposes the public web app and API on `http://127.0.0.1:3210` by default, then starts this Hono server on a private internal port. Browser code in that packaged app should call same-origin `/api` routes instead of hard-coding `8001`.

## Filesystem Defaults

`src/core/config.ts` defines two persistent roots:

- `projectsRoot`: `~/projects`
- `dataRoot`: `~/.llm/projects`

These defaults keep checked-out project workspaces separate from server-managed metadata.

## Programmatic Overrides

Repo-local callers can override the filesystem roots before using the core services by calling `setConfig()` from the internal config module during startup or test setup.

The package root exports `setConfig()` and `getConfig()` for desktop/runtime launchers that need to choose a project workspace root before mounting the Hono app:

```ts
import { createApp, createHttpServer, setConfig } from '@ank1015/llm-server';

setConfig({
  projectsRoot: '/Users/me/Projects',
  dataRoot: '/Users/me/.llm/projects',
});

const server = createHttpServer(createApp());
```

Call `setConfig()` before handling API requests. The desktop app should keep `dataRoot` in `~/.llm/projects` and only vary `projectsRoot`.

## Live Test Credentials

The live session tests use the central SDK keystore at `~/.llm-sdk/keys.env` unless a workspace caller overrides the SDK configuration separately.

See `docs/testing.md` for the expected live test setup.
