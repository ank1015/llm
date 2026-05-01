import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

const root = __dirname;
const sharedDir = resolve(root, 'src/shared');

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@main': resolve(root, 'src/main'),
        '@backend': resolve(root, 'src/backend'),
        '@shared': sharedDir,
      },
    },
    build: {
      rollupOptions: {
        input: { main: resolve(root, 'src/main/main.ts') },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': sharedDir,
      },
    },
    build: {
      rollupOptions: {
        input: { preload: resolve(root, 'src/preload/preload.ts') },
      },
    },
  },
  renderer: {
    root: resolve(root, 'src/renderer'),
    plugins: [react()],
    resolve: {
      alias: {
        '@renderer': resolve(root, 'src/renderer/src'),
        '@shared': sharedDir,
      },
    },
    build: {
      rollupOptions: {
        input: { index: resolve(root, 'src/renderer/index.html') },
      },
    },
  },
});
