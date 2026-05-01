# @ank1015/llm-electron-redesign

Full-stack Electron app scaffold: React renderer + embedded Node (Hono) backend, wired through a typed contextBridge.

This app is the next-generation replacement for `apps/desktop`. Keep it self-contained — do not couple it to `apps/desktop`, `apps/web`, or any workspace package other than what is already declared in `package.json`.

## Commands

```bash
pnpm --filter @ank1015/llm-electron-redesign dev        # electron-vite dev (HMR for renderer)
pnpm --filter @ank1015/llm-electron-redesign build      # Build main, preload, renderer to ./out
pnpm --filter @ank1015/llm-electron-redesign start      # Run the built app via electron-vite preview
pnpm --filter @ank1015/llm-electron-redesign package    # Build + electron-builder --dir (unpacked)
pnpm --filter @ank1015/llm-electron-redesign dist       # Build + electron-builder distributables
pnpm --filter @ank1015/llm-electron-redesign typecheck  # Type-check Node + Web project references
pnpm --filter @ank1015/llm-electron-redesign test       # Vitest unit tests
pnpm --filter @ank1015/llm-electron-redesign lint       # ESLint over src/ and tests/
pnpm --filter @ank1015/llm-electron-redesign clean      # Remove out/, dist/, release/, .tsbuildinfo
```

## Structure

```text
src/
  main/                # Electron main process (window mgmt, lifecycle, IPC registration)
    main.ts            # App entry: starts backend, registers IPC, opens window
    windows/           # BrowserWindow factories
    ipc/               # IPC handlers (thin wrappers around backend services)
  preload/             # contextBridge — only place that touches electron from the web side
    preload.ts         # Exposes `window.api` typed by @shared/ipc-contract
  renderer/            # React frontend (Vite-served in dev)
    index.html         # Vite entry document
    src/
      main.tsx         # React mount
      app.tsx          # Root component
      components/      # UI components
      hooks/           # React hooks (empty placeholder)
      lib/             # Bridge + HTTP client wrappers
      styles/          # Global stylesheet
  backend/             # Pure Node (no electron imports) — Hono server + services
    server.ts          # Backend controller (start/stop, port discovery)
    app.ts             # Hono app factory
    routes/            # Hono route modules (one per resource)
    services/          # Framework-agnostic domain logic
  shared/              # Cross-process contracts (no runtime dependencies)
    ipc-contract.ts    # IPC channel names + payload types
    api-contract.ts    # HTTP API request/response types
tests/unit/            # Vitest unit tests
electron.vite.config.ts
tsconfig.json          # Project references
tsconfig.node.json     # main + preload + backend + shared
tsconfig.web.json      # renderer + shared
```

## Architecture rules

- **Main process** never imports from `renderer/`. **Renderer** never imports from `main/`, `preload/`, or `backend/` directly — only `shared/` (types) and `window.api` via `lib/desktop-bridge.ts`.
- **Backend** must remain Electron-free so it could later run as a separate process or worker. It only depends on `hono`, `@hono/node-server`, and Node built-ins.
- **Preload** is the only file allowed to touch both `electron` and the `window` global. It exposes a single `DesktopApi` object whose shape lives in `@shared/ipc-contract`.
- All IPC channel names live in `IpcChannel` (`@shared/ipc-contract.ts`). Never use string literals at call sites.
- The backend always binds to `127.0.0.1` on an OS-assigned port. The renderer discovers the URL through `window.api.getBackendStatus()` — never hard-code ports.
- The Finder root defaults to `~/Desktop` and can be changed server-side with `LLM_ELECTRON_DESKTOP_ROOT=/path/to/root`.

## Conventions

- Strict TypeScript (inherits `tsconfig.base.json`).
- Filenames are `kebab-case` (enforced by ESLint `unicorn/filename-case`).
- React components are `PascalCase` exports inside `kebab-case.tsx` files.
- Backend services are framework-agnostic and live under `backend/services/`. Routes import services, never the other way around.

## Boundaries

Never:

- Import `electron` from `src/renderer/` or `src/backend/`.
- Hard-code the backend port or URL anywhere outside `src/backend/server.ts`.
- Disable `contextIsolation` or enable `nodeIntegration` in BrowserWindow config.

Ask first:

- Adding new runtime dependencies (the scaffold deliberately keeps the dep set minimal).
- Switching the build tool away from `electron-vite`.

Freely:

- Add new routes under `src/backend/routes/` and corresponding contract types in `src/shared/api-contract.ts`.
- Add new IPC channels by extending `IpcChannel` and `DesktopApi` together.
- Add new components under `src/renderer/src/components/`.
