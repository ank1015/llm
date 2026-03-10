# native-app

This package contains the monorepo's React Native Expo app scaffold, based on [HeroUI Native](https://github.com/heroui-inc/heroui-native).

## Get started

1. Install dependencies from the monorepo root

   ```bash
   pnpm install
   ```

2. Start the app from the monorepo root

   ```bash
   pnpm dev:native-app
   ```

3. If the API server is not reachable at the default local address, set
   `EXPO_PUBLIC_LLM_SERVER_URL` to your server base URL before starting Expo.

You can start developing by editing the files inside the **src/app** directory. This project uses file-based routing with Expo Router.

## About HeroUI Native

HeroUI Native is a comprehensive UI library built for React Native that provides:

- Beautiful, accessible components out of the box
- Consistent design system
- TypeScript support
- Customizable theming
- Modern styling with NativeWind/Tailwind CSS

Learn more about HeroUI Native at: https://github.com/heroui-inc/heroui-native
