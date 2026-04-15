# @ank1015/llm-setup-app

Electron setup app for guiding users through local prerequisites and launching the main LLM app with `npx`.

## Commands

```bash
pnpm --filter @ank1015/llm-setup-app dev       # Build and run the Electron app locally
pnpm --filter @ank1015/llm-setup-app build     # Compile main/preload code and copy renderer assets
pnpm --filter @ank1015/llm-setup-app package   # Build an unpacked Electron app
pnpm --filter @ank1015/llm-setup-app dist      # Build distributable binaries
pnpm --filter @ank1015/llm-setup-app typecheck # Type-check the app
pnpm --filter @ank1015/llm-setup-app lint      # Lint source and scripts
pnpm --filter @ank1015/llm-setup-app clean     # Remove build artifacts
```

## Structure

```text
src/main/      # Electron main process, dependency checks, app launch orchestration
src/preload/   # Safe renderer bridge exposed through contextBridge
src/renderer/  # Static setup wizard UI
scripts/       # Small build helpers
```

## Notes

- Keep native OS operations in `src/main/` and expose only narrow, typed APIs through the preload bridge.
- The setup app depends on `@ank1015/llm-agents` and `@ank1015/llm-sdk` through workspace dependencies.
- Update this file and `README.md` when packaging commands, dependency checks, or launch behavior change.
