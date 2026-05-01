#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDirectory, '..');
const stageRoot = resolve(packageRoot, '.package');

function run(command, args, options = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      ...options,
      shell: process.platform === 'win32',
      stdio: 'inherit',
    });

    child.on('error', rejectRun);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolveRun();
        return;
      }

      rejectRun(
        new Error(
          signal
            ? `${command} exited with signal ${signal}`
            : `${command} exited with code ${code ?? 'unknown'}`
        )
      );
    });
  });
}

await rm(stageRoot, { recursive: true, force: true });

await run('pnpm', ['--filter', '@ank1015/llm-desktop-app', 'deploy', '--prod', stageRoot], {
  cwd: resolve(packageRoot, '../..'),
});

await Promise.all([
  rm(resolve(stageRoot, '.turbo'), { recursive: true, force: true }),
  rm(resolve(stageRoot, 'release'), { recursive: true, force: true }),
  rm(resolve(stageRoot, 'scripts'), { recursive: true, force: true }),
  rm(resolve(stageRoot, 'src'), { recursive: true, force: true }),
  rm(resolve(stageRoot, 'tsconfig.json'), { force: true }),
]);
