import { cpSync, mkdirSync } from 'node:fs';

import { build, context } from 'esbuild';

const isWatch = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: ['src/chrome/background.ts'],
  bundle: true,
  format: 'esm' as const,
  platform: 'browser' as const,
  outdir: 'dist/chrome',
  target: 'chrome120',
  logLevel: 'info' as const,
};

async function main(): Promise<void> {
  mkdirSync('dist/chrome', { recursive: true });
  cpSync('src/chrome/manifest.json', 'dist/chrome/manifest.json');

  if (isWatch) {
    const ctx = await context(buildOptions);
    await ctx.watch();
    console.log('[esbuild] watching for changes...');
  } else {
    await build(buildOptions);
  }
}

main();
