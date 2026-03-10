# @ank1015/llm-native-app

Expo Router app package for the monorepo.

## Commands

- `pnpm start` — Start the Expo dev server
- `pnpm ios` — Open the iOS simulator
- `pnpm android` — Open the Android emulator or attached device
- `pnpm web` — Run the web target
- `pnpm lint` — Lint TS/TSX sources
- `pnpm typecheck` — Type-check without emitting

## Structure

```
assets/
  expo.icon/          — Generated Expo icon assets
  images/             — App and starter image assets
src/
  app/                — Expo Router routes
  components/         — Shared UI building blocks
  constants/          — Theme constants and layout values
  hooks/              — Platform and theme hooks
  global.css          — Web-only global styles
app.json              — Expo app configuration
```

## Conventions

- Keep routes in `src/app/`; do not colocate reusable components there.
- Prefer Expo Go before adding custom native builds.
- Keep file names kebab-case unless Expo Router requires special names such as `_layout.tsx`.
- Use `react-native-safe-area-context` or scroll-view inset handling for safe areas.
- Keep the package-local `.npmrc`; Expo expects a hoisted install layout when using pnpm.
