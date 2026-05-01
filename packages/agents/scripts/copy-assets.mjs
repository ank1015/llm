#!/usr/bin/env node

import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const assets = [
  {
    source: resolve(packageRoot, 'src/system-prompts/SOUL.md'),
    target: resolve(packageRoot, 'dist/system-prompts/SOUL.md'),
  },
];

await Promise.all(
  assets.map(async ({ source, target }) => {
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
  })
);
