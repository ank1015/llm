# Inspection

## `@ank1015/llm-core`

Path: `packages/core`

### OS Specificity

- No hard OS-specific runtime code found.
- Should work on macOS, Windows, and Linux.
- No runtime use of filesystem, shell commands, child processes, or native binaries.
- Codex provider user-agent metadata is derived from the current OS platform, release, and architecture instead of hardcoding macOS/arm64.

### Device Requirements

- Node.js `>=20.0.0`
- pnpm `9.15.0` for monorepo development
- Network access for provider API calls
- Provider API credentials as needed

### Runtime Dependencies

Direct package dependencies:

- `@anthropic-ai/sdk`
- `@google/genai`
- `@sinclair/typebox`
- `ajv`
- `ajv-formats`
- `openai`
- `partial-json`
- `uuid`

No direct core dependency appears to require OS-specific native setup.

### Browser Note

- Mostly portable TypeScript/Web API-style code.
- Not fully browser-audited.
- Codex user-agent construction reads Node's `node:os` metadata.
- OpenAI image edits use `Buffer`, so that path is Node-specific unless bundled/polyfilled.

### Checked

Passed:

```bash
pnpm --filter @ank1015/llm-core build
pnpm --filter @ank1015/llm-core typecheck
pnpm --filter @ank1015/llm-core test:unit
```

Integration tests were not run because they require live provider credentials.

## `@ank1015/llm-web-app`

Path: `apps/web`

### OS Specificity

- Standard Next.js web app.
- No app runtime OS-specific code found.
- Browser UI uses normal web APIs: `fetch`, `WebSocket`, DOM storage, and DOM events.
- Node-only usage is limited to build/test/config files such as `next.config.ts` and `vitest.config.ts`.
- Depends on the local server API instead of directly using filesystem, shell, or PTY APIs.

### Device Requirements

- Node.js `>=20.0.0`
- pnpm `9.15.0` for monorepo development
- Modern browser
- Running `@ank1015/llm-server` backend
- Server URL defaults to `http://localhost:8001`
- `NEXT_PUBLIC_LLM_SERVER_BASE_URL` can point the UI at another server
- WebSocket support for terminal sessions

### Runtime Dependencies

Main direct dependencies:

- `next`
- `react`
- `react-dom`
- `@ank1015/llm-server`
- `@ank1015/llm-sdk`
- `@tanstack/react-query`
- `zustand`
- `@monaco-editor/react`
- `@xterm/xterm`
- Markdown/math/code rendering and UI packages

### Browser Note

- This is the browser-facing package.
- OS-specific local work is handled by `@ank1015/llm-server`, not the web app.

### Checked

Passed:

```bash
pnpm --filter @ank1015/llm-web-app typecheck
pnpm --filter @ank1015/llm-web-app test:unit
pnpm --filter @ank1015/llm-web-app build
```

Unit result:

- 31 test files passed
- 126 tests passed
- React `act(...)` warnings appeared in a few component tests, but tests passed.

## `@ank1015/llm-agents`

Path: `packages/agents`

### OS Specificity

- Node-only package by design.
- Should work on macOS, Windows, and Linux, but depends on local OS capabilities.
- Uses filesystem, path, OS, process, shell, and child process APIs.
- Has Windows-specific shell handling:
  - looks for Git Bash in `Program Files`
  - also checks per-user Git installs under `LOCALAPPDATA`
  - falls back to `bash.exe` on `PATH`
  - honors `shellPath` in `~/.pi/agent/settings.json`
  - uses `taskkill` to kill process trees
- Has Unix/macOS handling:
  - prefers `/bin/bash`
  - falls back to `bash` on `PATH`, then `sh`
  - uses process-group `SIGKILL`
- Includes macOS filename fallback handling for screenshot-style paths.

### Device Requirements

- Node.js `>=20.0.0`
- pnpm `9.15.0` for monorepo development
- Writable config/bin directory under the user home directory
- A shell for the bash tool:
  - macOS/Linux: `/bin/bash`, `bash`, or `sh`
  - Windows: Git Bash or another `bash.exe`
  - custom shell path can be configured with `shellPath` in `~/.pi/agent/settings.json`
- `fd` and `rg` for file search tools.
  - The package can auto-download them from GitHub for macOS/Linux/Windows.
  - `.tar.gz` extraction requires `tar`.
  - Windows `.zip` extraction tries `tar` first, then PowerShell `Expand-Archive`.
- Network access if auto-downloading `fd`/`rg`.

### Runtime Dependencies

Direct package dependencies:

- `@ank1015/llm-core`
- `@silvia-odwyer/photon-node`
- `@sinclair/typebox`
- `chalk`
- `diff`
- `file-type`
- `glob`
- `tsx`

Notable dependency:

- `@silvia-odwyer/photon-node` uses a WASM file for image resizing. If unavailable, image resizing falls back to returning the original image.

### Browser Note

- Not browser-compatible.
- Requires Node filesystem and child process access.

### Checked

Passed:

```bash
pnpm --filter @ank1015/llm-agents build
pnpm --filter @ank1015/llm-agents typecheck
pnpm --filter @ank1015/llm-agents test:unit
```

Integration tests currently pass with no tests.

## `@ank1015/llm-server`

Path: `packages/server`

### OS Specificity

- Node-only backend package.
- Should run on macOS, Windows, and Linux, but depends on several OS-level tools and native packages.
- Uses filesystem, HTTP server, WebSocket, shell/process, PTY, Git, temp files, symlinks, and archive extraction.
- Default network bind:
  - `HOST=127.0.0.1`
  - `PORT=8001`
- Default storage:
  - project workspaces: `~/projects`
  - metadata: `~/.llm/projects`
  - SDK keys: `~/.llm-sdk/keys.env`

### Device Requirements

- Node.js `>=20.0.0`
- pnpm `9.15.0` for monorepo development
- Writable home directory or configured storage roots
- Network access for model calls and skill downloads
- Provider credentials for live model/session routes
- Git for artifact checkpoints
- `tar` for installing skills from GitHub archives
- Shell/terminal support:
  - macOS/Linux: `$SHELL`, `/bin/bash`, `bash`, or `sh`
  - Windows: `ComSpec`, PowerShell, or `cmd.exe`
- Python 3 is optional fallback for PTY support on non-Windows when `node-pty` fails with `posix_spawn`.
- Claude credential reload expects the `claude` CLI on PATH and writes a temporary bash wrapper.

### Runtime Dependencies

Direct package dependencies:

- `@ank1015/llm-agents`
- `@ank1015/llm-core`
- `@ank1015/llm-sdk`
- `@anthropic-ai/claude-agent-sdk`
- `@hono/node-server`
- `@sinclair/typebox`
- `hono`
- `node-pty`
- `ws`

Notable dependencies:

- `node-pty` is a native addon used for terminal sessions.
- `@anthropic-ai/claude-agent-sdk` brings platform-specific `sharp` packages.
- Inherits agents/core/sdk dependencies, including `fd`/`rg` needs from agent tools.

### Browser Note

- Not browser-compatible.
- This is a local Node server with filesystem, subprocess, PTY, and WebSocket server behavior.

### Checked

Passed:

```bash
pnpm --filter @ank1015/llm-server build
pnpm --filter @ank1015/llm-server typecheck
pnpm --filter @ank1015/llm-server test:unit
```

Unit result:

- 22 test files passed
- 87 tests passed
- No type errors

Integration result:

- 5 of 6 integration files passed.
- 1 integration test failed in `tests/integration/routes/resources.app.test.ts`.
- Failure appears to be stale expected registry data: `/api/skills` now returns multiple skills, while the test expected only the `pdf` object.

Live tests were not run because they require live provider credentials.

## `@ank1015/llm-sdk`

Path: `packages/sdk`

### OS Specificity

- No hard macOS-only or Windows-only code found.
- Should work on macOS, Windows, and Linux under Node.
- Uses Node filesystem/path APIs for:
  - credentials file: `~/.llm-sdk/keys.env`
  - session files: `~/.llm-sdk/sessions/*.jsonl`
  - reading image input paths
  - writing generated image output files
- Uses `node:os`, `node:path`, `node:fs/promises`, and `node:crypto`.

### Device Requirements

- Node.js `>=20.0.0`
- pnpm `9.15.0` for monorepo development
- Writable home directory or custom SDK config paths
- Network access for provider API calls
- Provider credentials in `keys.env` or custom keys file

### Runtime Dependencies

Direct package dependencies:

- `@ank1015/llm-core`
- `@modelcontextprotocol/sdk`
- `@sinclair/typebox`

The package also inherits core provider dependencies through `@ank1015/llm-core`.

### Browser Note

- SDK is Node-oriented.
- Not suitable for direct browser use without replacing local filesystem/session/key handling.

### Checked

Passed:

```bash
pnpm --filter @ank1015/llm-sdk build
pnpm --filter @ank1015/llm-sdk typecheck
pnpm --filter @ank1015/llm-sdk test:unit
```

Integration tests were not run because they require live provider credentials.
