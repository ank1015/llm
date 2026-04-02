# Web App Testing

Use these commands for the package-local checks:

```bash
pnpm --filter @ank1015/llm-web-app typecheck
pnpm --filter @ank1015/llm-web-app lint
pnpm --filter @ank1015/llm-web-app test
pnpm --filter @ank1015/llm-web-app build
```

You can also run the same checks directly from the app directory with `pnpm --dir apps/web ...`.

## Current Coverage Shape

The app currently relies on unit tests under `tests/unit/` for:

- client-api helpers
- React Query hooks
- Zustand stores
- major chat, workspace, and terminal components

There is no separate integration or end-to-end test suite in this app package yet.
