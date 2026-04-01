import { spawn } from 'node:child_process';

const isWindows = process.platform === 'win32';
const commandArgs = process.argv.slice(2);

if (commandArgs.length === 0) {
  console.error('Usage: node scripts/run-parallel.mjs <command> [<command> ...]');
  process.exit(1);
}

const children = new Set();
let shuttingDown = false;
let exitCode = 0;

const spawnOptions = {
  shell: true,
  stdio: 'inherit',
};

const terminate = (child) => {
  if (!child || child.killed) {
    return;
  }

  if (isWindows) {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
    });

    killer.on('error', () => {
      child.kill();
    });

    return;
  }

  child.kill('SIGTERM');
};

const shutdown = (code = 0) => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  exitCode = code;

  for (const child of children) {
    terminate(child);
  }

  setTimeout(() => process.exit(exitCode), 150).unref();
};

for (const command of commandArgs) {
  const child = spawn(command, spawnOptions);

  children.add(child);

  child.on('error', (error) => {
    console.error(error);
    shutdown(1);
  });

  child.on('exit', (code) => {
    children.delete(child);

    if (!shuttingDown) {
      shutdown(code ?? 0);
    }
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => shutdown(0));
}
