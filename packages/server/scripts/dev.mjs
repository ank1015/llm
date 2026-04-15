import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const tscBin = require.resolve('typescript/bin/tsc');
const packageRoot = fileURLToPath(new URL('..', import.meta.url));

function spawnProcess(args) {
  return spawn(process.execPath, args, {
    cwd: packageRoot,
    stdio: 'inherit',
  });
}

function runOnce(args) {
  return new Promise((resolve) => {
    const child = spawnProcess(args);
    child.on('exit', (code, signal) => {
      resolve({ code, signal });
    });
  });
}

function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  child.kill();
}

const initialBuild = await runOnce([tscBin]);
if (initialBuild.code !== 0 || initialBuild.signal) {
  process.exit(initialBuild.code ?? 1);
}

const children = [
  spawnProcess([tscBin, '--watch', '--preserveWatchOutput']),
  spawnProcess(['--watch', 'dist/server.js']),
];

let exiting = false;
function shutdown(code = 0) {
  if (exiting) {
    return;
  }

  exiting = true;
  for (const child of children) {
    stopChild(child);
  }

  process.exitCode = code;
}

for (const child of children) {
  child.on('exit', (code, signal) => {
    if (!exiting) {
      console.error(`dev child exited${signal ? ` with ${signal}` : ` with code ${code ?? 0}`}`);
      shutdown(code ?? 1);
    }
  });
}

process.on('SIGINT', () => {
  shutdown(130);
});
process.on('SIGTERM', () => {
  shutdown(143);
});
process.on('exit', () => {
  for (const child of children) {
    stopChild(child);
  }
});
