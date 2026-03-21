#!/usr/bin/env node

import { access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const maxStateDir = fileURLToPath(new URL('../../../../', import.meta.url));
const packageDir = resolve(maxStateDir, 'temp/node_modules/@ank1015/llm-agents');
const distCliPath = resolve(packageDir, 'dist/cli/web-task.js');
const sourceCliPath = resolve(packageDir, 'src/cli/web-task.ts');
const tsxBinaryPath = resolve(
  maxStateDir,
  `temp/node_modules/.bin/${process.platform === 'win32' ? 'tsx.cmd' : 'tsx'}`
);

async function main() {
  const args = ['gmail', 'get-email', ...process.argv.slice(2)];

  if (await pathExists(distCliPath)) {
    await run(process.execPath, [distCliPath, ...args]);
    return;
  }

  if ((await pathExists(sourceCliPath)) && (await pathExists(tsxBinaryPath))) {
    await run(tsxBinaryPath, [sourceCliPath, ...args]);
    return;
  }

  throw new Error(
    [
      'Could not locate the web-task CLI for the installed web skill.',
      `Checked dist path: ${distCliPath}`,
      `Checked source path: ${sourceCliPath}`,
    ].join('\n')
  );
}

async function run(command, args) {
  const exitCode = await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
    });

    child.on('error', rejectPromise);
    child.on('exit', (code, signal) => {
      if (signal) {
        rejectPromise(new Error(`Command exited with signal ${signal}`));
        return;
      }

      resolvePromise(code ?? 1);
    });
  });

  process.exitCode = exitCode;
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
