# Configuration

## Path Defaults

The internal config layer uses:

- `projectsRoot`: `~/projects`
- `dataRoot`: `~/.llm/projects`

`projectsRoot` stores agent-visible working files.

`dataRoot` stores:

- project metadata
- artifact metadata
- session metadata
- persisted session trees / JSONL history

## Environment Variables

The packaged HTTP server reads:

- `HOST` — default `127.0.0.1`
- `PORT` — default `8001`
- `CORS_ORIGIN` — default `*`

`CORS_ORIGIN` is applied to `/api/*`.

## Credentials

Session execution uses file-backed credentials through `@ank1015/llm-sdk-adapters`.

The server expects API credentials to be available through the keys adapter flow used across the monorepo.

Internal helper support exists for reloadable credentials for:

- `codex`
- `claude-code`

These helpers are maintainers-only utilities used by the server runtime and tests.

## Reasoning-Level Provider Options

Per-turn reasoning level is mapped to provider options for:

- `codex`
- `claude-code`
- `google`

Other providers currently receive an empty provider-options object.
