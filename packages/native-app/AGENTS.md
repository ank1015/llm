# `@ank1015/llm-native-app`

Expo mobile client for the monorepo's server-backed project/artifact/session workflow.

## Package role

- Native and Expo web client for `@ank1015/llm-server`
- Consumes shared HTTP DTOs from `@ank1015/llm-app-contracts`
- Owns the Folders mobile UI, client-side stores, and mobile-specific artifact/thread views
- Stays private to the repo; this package is not being prepared for npm publishing

## Commands

```bash
pnpm start
pnpm ios
pnpm android
pnpm web
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
```

## Structure

```text
src/
  app/                 Expo Router entrypoints and route layouts
  components/projects/ Project, artifact, thread, and dialog UI
  contexts/            App theme and top-level providers
  lib/client-api/      Server transport layer using @ank1015/llm-app-contracts
  lib/messages/        Thread/message shaping helpers
  stores/              Zustand state for projects, sessions, sidebar, chat, and UI
  styles/              Shared UI style helpers
```

## Notes

- The product branding remains `Folders` in Expo/native config.
- The canonical server env var is `EXPO_PUBLIC_LLM_SERVER_BASE_URL`.
- `EXPO_PUBLIC_LLM_SERVER_URL` is compatibility-only and should not be used in new docs.
- Do not reintroduce tracked personal server URLs into `app.json`.
- Keep tests focused on pure logic/state modules in this package; component render tests are
  intentionally out of scope for now.
