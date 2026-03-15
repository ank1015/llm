# `@ank1015/llm-native-app`

Private Expo mobile client for [`@ank1015/llm-server`](../server/README.md).

This workspace package contains the **Folders** app. The workspace/package name is
`@ank1015/llm-native-app`, while the end-user product branding inside Expo and the
checked-in iOS project remains `Folders`.

## What it does

- Connects to `@ank1015/llm-server` for projects, artifact directories, sessions, and
  streamed agent conversations
- Uses `@ank1015/llm-app-contracts` through the local `src/lib/client-api` boundary
- Renders native-first project, thread, and artifact flows with Expo Router and Zustand
- Supports native and web artifact viewing paths where needed

## Local development

From the monorepo root:

```bash
pnpm install
pnpm dev:native-app
```

Or from this package:

```bash
pnpm start
pnpm ios
pnpm android
pnpm web
```

## Server configuration

The canonical env var is:

```bash
EXPO_PUBLIC_LLM_SERVER_BASE_URL=http://localhost:8001
```

- Copy [`.env.example`](./.env.example) to `.env.local` for local development
- `EXPO_PUBLIC_LLM_SERVER_URL` is still read temporarily for compatibility
- If no env var is present, the app falls back to Expo/native host inference and then to a
  platform-specific localhost default

No personal or environment-specific server URL should be committed to `app.json`.

## Package health

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
```

## Docs

- [AGENTS.md](./AGENTS.md) - package structure and maintenance notes
- [docs/README.md](./docs/README.md) - package docs index
- [docs/architecture.md](./docs/architecture.md) - app structure and data flow
- [docs/configuration.md](./docs/configuration.md) - env vars and server resolution
- [docs/testing.md](./docs/testing.md) - test and validation strategy
