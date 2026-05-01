# Cross-OS Runtime Assumptions

This checklist captures what the target machine should have or allow for the packaged app:

```bash
npx @ank1015/llm
```

The app is intended to run on macOS and Windows. Linux should also work in many environments, but it is not the primary compatibility target yet.

## Baseline Requirements

- Node.js `>=20.0.0` is installed.
- `npm`/`npx` can install public npm packages from the npm registry.
- The user can run local Node CLI programs from `npx`.
- The machine can install platform-specific npm dependencies during `npx` install.
- The user's home directory is writable.
- Temporary directories are writable.
- The app can create and read files under its storage directories.
- The app can spawn child processes.
- The app can bind local loopback HTTP ports.
- The app can open local loopback URLs in a browser, unless launched with `--no-open`.

## Network and Ports

- The launcher exposes the app and API on one public local origin.
- Default public origin: `http://127.0.0.1:3210`.
- The public port can be changed with `llm --port <port>`.
- The public host can be changed with `llm --host <host>`.
- The launcher starts the Hono server and Next.js web server on private internal ports.
- Local firewall or security software must allow loopback connections between:
  - the browser and launcher public port
  - the launcher and its internal server/web ports
- Network access is needed for:
  - npm package installation
  - model/provider API calls
  - downloading skills
  - downloading agent search tools when missing

## Storage Assumptions

- Project workspaces default to `~/projects`.
- Server metadata defaults to `~/.llm/projects`.
- SDK credentials default to `~/.llm-sdk/keys.env`.
- Codex credential reload reads `~/.codex/auth.json`.
- Claude credential reload writes a temporary wrapper script and deletes it after use.
- Artifact temp workspaces create `.max/temp` and `.max/skills` inside artifact directories.
- Package wiring in artifact temp workspaces prefers symlinks/junctions and falls back to copying when links are blocked.

## OS Capabilities

- macOS and Windows are intentionally supported.
- Linux is expected to be close, but it should be smoke-tested before being called fully supported.
- Path handling should support POSIX and Windows path separators.
- The OS must allow child-process execution.
- The OS must allow local process environment variables to be passed to child processes.
- The OS must allow executable files or command wrappers in temporary directories.
- Windows should allow `.cmd` wrapper execution for Claude credential reload.
- macOS/Linux should allow POSIX `sh` wrapper execution for Claude credential reload.

## Native npm Packages

- `node-pty` must install successfully for the target platform.
- Native npm package installation may require npm's normal platform binary resolution to work.
- If `node-pty` fails at runtime on Unix-like hosts with specific `posix_spawn` errors, Python 3 can be used as a PTY fallback.
- On Windows, terminal support depends primarily on `node-pty`; there is no Python PTY fallback.

## Shell and Terminal Assumptions

- Terminal sessions require an available shell.
- macOS/Linux shell lookup uses:
  - `$SHELL`
  - `/bin/bash`
  - `bash` on `PATH`
  - `sh` on `PATH`
- Windows shell lookup uses:
  - `ComSpec`
  - `powershell.exe`
  - `cmd.exe`
- Terminal sessions require the OS to support pseudo-terminal behavior through `node-pty`.
- Detached terminal cleanup needs child processes to respond to normal process termination.

## Required or Feature-Specific CLIs

- Git is required for artifact checkpoints.
- `tar` is required for installing skills from GitHub `.tar.gz` archives.
- `fd` and `rg` are required by agent file-search tools.
- The agents package can auto-download `fd` and `rg` for supported platforms when network access is available.
- Windows `.zip` extraction for downloaded tools can use `tar` or PowerShell `Expand-Archive`.
- Claude credential reload requires the `claude` CLI on `PATH`.
- Codex credential reload requires a valid local Codex auth file.

## Browser Assumptions

- A modern browser is available.
- Browser WebSocket support is available.
- Browser JavaScript, `fetch`, and DOM storage APIs are available.
- The browser can reach the app's local loopback origin.

## Provider and Credential Assumptions

- Model calls require provider credentials in the SDK keystore or reloadable local auth sources.
- Live Codex usage requires valid Codex credentials.
- Live Claude Code usage requires the Claude CLI and valid Claude local auth.
- Provider APIs must be reachable from the machine.

## Packaging Assumptions

- `@ank1015/llm` installs `@ank1015/llm-server` as a runtime dependency.
- The web production build is vendored into `packages/app/vendor/web`.
- The backend runtime dependencies are installed by npm for the target platform.
- The packaged app should be smoke-tested from the packed tarball on macOS and Windows before calling a release fully cross-platform.

## Recommended Cross-OS Smoke Test

Build and pack:

```bash
pnpm release:app:build
pnpm release:app:smoke
pnpm --dir packages/app pack
```

Then test the produced tarball on each target OS:

```bash
npx /path/to/ank1015-llm-*.tgz --no-open
```

Verify:

- `http://127.0.0.1:3210` loads the web app.
- `http://127.0.0.1:3210/api/health` returns healthy JSON.
- Project listing works.
- Creating/opening a project works.
- Terminal creation works.
- Checkpoints work when Git is installed.
- Skill installation works when network and `tar` are available.
