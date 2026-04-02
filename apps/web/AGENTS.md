<!-- BEGIN:nextjs-agent-rules -->

# @ank1015/llm-web-app

Private Next.js web client for the llm server stack.

This version has breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before writing framework-level code, and heed deprecation notices.

<!-- END:nextjs-agent-rules -->

## Commands

```bash
pnpm --filter @ank1015/llm-web-app dev
pnpm --filter @ank1015/llm-web-app build
pnpm --filter @ank1015/llm-web-app start
pnpm --filter @ank1015/llm-web-app typecheck
pnpm --filter @ank1015/llm-web-app lint
pnpm --filter @ank1015/llm-web-app test
```

## Module Map

- `src/app/` - App Router pages, layouts, and top-level route entrypoints
- `src/components/` - project shell, artifact workspace, streaming chat, terminal, and shared UI components
- `src/lib/client-api/` - typed fetch and WebSocket client wrappers over `@ank1015/llm-server`
- `src/hooks/api/` - React Query hooks that back project, session, key, model, and terminal flows
- `src/stores/` - Zustand stores for composer state, sessions, terminals, sidebar state, and UI coordination
- `src/lib/messages/` - chat markdown, mentions, metrics, and working-trace helpers
- `tests/unit/` - unit tests for client-api helpers, hooks, stores, and major components

## Conventions

- Keep this app workspace-only. Do not add publish or package-distribution workflows here.
- When the server contract changes, update `src/lib/client-api/`, the affected hooks, and the related unit tests together.
- Prefer package-local docs over generic Next.js boilerplate when documenting app behavior.
- Preserve the `NEXT_PUBLIC_LLM_SERVER_BASE_URL` override in docs and tests whenever backend URL behavior changes.
