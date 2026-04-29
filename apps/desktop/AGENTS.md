# @ank1015/llm-desktop-app

Electron desktop app shell for the embedded server and frontend runtime.

## Commands

```bash
pnpm --filter @ank1015/llm-desktop-app dev       # Build and run the Electron app locally
pnpm --filter @ank1015/llm-desktop-app build     # Compile main/preload code and copy renderer assets
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
```

## Notes

- Keep server startup, shutdown, ports, and filesystem paths behind `src/main/server/`.
- Expose renderer capabilities through typed, narrow IPC contracts in `src/shared/` and `src/preload/`.
- Merge setup-app functionality here incrementally instead of extending `apps/setup`.
