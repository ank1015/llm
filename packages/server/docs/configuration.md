# Server Configuration

The server package is configured through a small mix of process environment variables and runtime filesystem overrides.

## Network Defaults

`src/server.ts` uses these defaults when you start the package directly:

- `HOST=127.0.0.1`
- `PORT=8001`

If you do not set either variable, the local server binds only to localhost on port `8001`.

## Filesystem Defaults

`src/core/config.ts` defines two persistent roots:

- `projectsRoot`: `~/projects`
- `dataRoot`: `~/.llm/projects`

These defaults keep checked-out project workspaces separate from server-managed metadata.

## Programmatic Overrides

Repo-local callers can override the filesystem roots before using the core services by calling `setConfig()` from the internal config module during startup or test setup.

This package does not currently publish a dedicated `./core` subpath; treat `src/core/config.ts` as internal workspace wiring rather than a public package entrypoint.

## Live Test Credentials

The live session tests use the central SDK keystore at `~/.llm-sdk/keys.env` unless a workspace caller overrides the SDK configuration separately.

See `docs/testing.md` for the expected live test setup.
