#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDirectory, '..');
const stageRoot = resolve(packageRoot, '.package');
const pnpmExecutable = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

await rm(stageRoot, { recursive: true, force: true });

await execFileAsync(
  pnpmExecutable,
  ['--filter', '@ank1015/llm-desktop-app', 'deploy', '--prod', stageRoot],
  {
    cwd: resolve(packageRoot, '../..'),
    maxBuffer: 1024 * 1024 * 20,
    stdio: 'inherit',
  }
);

await Promise.all([
  rm(resolve(stageRoot, '.turbo'), { recursive: true, force: true }),
  rm(resolve(stageRoot, 'release'), { recursive: true, force: true }),
  rm(resolve(stageRoot, 'scripts'), { recursive: true, force: true }),
  rm(resolve(stageRoot, 'src'), { recursive: true, force: true }),
  rm(resolve(stageRoot, 'tsconfig.json'), { force: true }),
]);
