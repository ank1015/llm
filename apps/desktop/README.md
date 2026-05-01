# @ank1015/llm-desktop-app

Electron desktop app shell for the future combined local server and frontend experience.

```bash
pnpm --filter @ank1015/llm-desktop-app dev
pnpm --filter @ank1015/llm-desktop-app build
pnpm --filter @ank1015/llm-desktop-app typecheck
```

The app currently renders one minimal screen. The embedded server lifecycle boundary is prepared under `src/main/server/` so the Hono backend can be wired in without coupling it to window creation or renderer code.
