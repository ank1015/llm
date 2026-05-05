# LLM Electron Redesign

Full-stack Electron application scaffold:

- **Renderer** — React 19 + Vite (HMR in dev) under `src/renderer/`.
- **Main** — Electron main process orchestration under `src/main/`.
- **Preload** — Typed `contextBridge` under `src/preload/`.
- **Backend** — Hono HTTP server (Node) embedded in the main process under `src/backend/`.
- **Shared** — Cross-process TypeScript contracts under `src/shared/`.

Build is driven by [`electron-vite`](https://electron-vite.org/), packaged with [`electron-builder`](https://www.electron.build/).

## Quick start

```bash
pnpm install
pnpm --filter @ank1015/llm-electron-redesign dev
```

This launches Electron and opens the renderer with hot module reloading. The embedded backend starts automatically on a loopback port and the renderer discovers its URL via `window.api.getBackendStatus()`.

The Finder root defaults to `~/Desktop`. To point it somewhere else from the backend side, set:

```bash
LLM_ELECTRON_DESKTOP_ROOT=/path/to/root pnpm --filter @ank1015/llm-electron-redesign dev
```

## Production build

```bash
pnpm --filter @ank1015/llm-electron-redesign build    # Output to ./out
pnpm --filter @ank1015/llm-electron-redesign dist     # Distributables to ./release
```

## Where to put new code

| Layer    | Path                | Imports allowed                       |
| -------- | ------------------- | ------------------------------------- |
| Renderer | `src/renderer/src/` | `@shared/*`, `window.api`             |
| Preload  | `src/preload/`      | `electron`, `@shared/*`               |
| Main     | `src/main/`         | `electron`, `@backend/*`, `@shared/*` |
| Backend  | `src/backend/`      | `hono`, `node:*`, `@shared/*`         |
| Shared   | `src/shared/`       | type-only, no runtime deps            |

See `AGENTS.md` for the full architectural contract.
