/* global process */

import { cp, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Moon02Icon, Sun01Icon } from '@hugeicons/core-free-icons';

const root = process.cwd();
const rendererSource = resolve(root, 'src/renderer');
const rendererTarget = resolve(root, 'dist/renderer');
const preloadSource = resolve(root, 'src/preload/preload.cjs');
const preloadTarget = resolve(root, 'dist/preload/preload.cjs');

await mkdir(rendererTarget, { recursive: true });
await mkdir(resolve(root, 'dist/preload'), { recursive: true });
await cp(rendererSource, rendererTarget, { recursive: true });
await cp(preloadSource, preloadTarget);
await writeFile(
  resolve(rendererTarget, 'theme-icons.js'),
  `window.desktopThemeIcons = ${JSON.stringify({
    dark: Moon02Icon,
    light: Sun01Icon,
  })};\n`
);
