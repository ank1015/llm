# @ank1015/llm-native-app

Expo Router app package for the monorepo.

## Commands

```bash
pnpm start    # Start the Expo dev server
pnpm ios      # Open the iOS simulator
pnpm android  # Open the Android emulator or device
pnpm web      # Run the web target
pnpm lint     # Lint TS/TSX sources
pnpm typecheck
```

## Notes

- Routes live in `src/app/`.
- Start with Expo Go before considering custom native builds.
- The package keeps Expo's generated `.npmrc` with `node-linker=hoisted`, which is the expected install layout for Expo with pnpm.
