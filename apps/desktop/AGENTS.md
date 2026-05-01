# @ank1015/llm-desktop-app

Electron desktop app shell for the embedded server and frontend runtime.

## Commands

```bash
pnpm --filter @ank1015/llm-desktop-app dev       # Build and run the Electron app locally
pnpm --filter @ank1015/llm-desktop-app build     # Build server/web, compile Electron code, and assemble web assets
pnpm --filter @ank1015/llm-desktop-app package   # Build an unpacked Electron app
pnpm --filter @ank1015/llm-desktop-app dist      # Build distributable binaries
pnpm --filter @ank1015/llm-desktop-app typecheck # Type-check the app
pnpm --filter @ank1015/llm-desktop-app lint      # Lint source and scripts
pnpm --filter @ank1015/llm-desktop-app clean     # Remove build artifacts
```

## Structure

```text
src/main/        # Electron main process and desktop lifecycle
src/main/server/ # Embedded server lifecycle boundary
src/preload/     # Safe renderer bridge exposed through contextBridge
src/renderer/    # Minimal first-screen renderer shell
src/shared/      # Shared IPC contract types
scripts/         # Small build helpers
vendor/          # Generated standalone web payload assembled at build time
```

## Notes

- Keep server startup, shutdown, ports, and filesystem paths behind `src/main/server/`.
- Expose renderer capabilities through typed, narrow IPC contracts in `src/shared/` and `src/preload/`.
- Treat `vendor/` as generated output; rebuild it through the package scripts.
