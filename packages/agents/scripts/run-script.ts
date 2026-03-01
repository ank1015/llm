#!/usr/bin/env -S node --enable-source-maps
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function usage(): void {
  const script = process.argv[1] ?? 'run-script.ts';
  process.stderr.write(`Usage: ${script} <script.ts> [args...]\n`);
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack || error.message;
  }
  return String(error);
}

async function main(): Promise<void> {
  const [targetScriptPath, ...scriptArgs] = process.argv.slice(2);
  if (!targetScriptPath) {
    usage();
    process.exit(1);
  }

  const absoluteTargetPath = resolve(targetScriptPath);

  // Make process.argv inside target script look like direct execution:
  //   node <targetScriptPath> ...args
  process.argv = [process.argv[0] ?? 'node', absoluteTargetPath, ...scriptArgs];

  await import(pathToFileURL(absoluteTargetPath).href);
}

void main()
  .then(async () => {
    // Allow one tick for stdout/stderr flush.
    await new Promise<void>((resolveNext) => {
      setImmediate(resolveNext);
    });

    // Default behavior: hard-exit so lingering sockets from extension SDK
    // do not keep the process alive after script work has completed.
    if (process.env.AGENTS_RUNNER_KEEP_ALIVE === '1') {
      return;
    }

    process.exit(0);
  })
  .catch((error) => {
    process.stderr.write(`${formatError(error)}\n`);
    process.exit(1);
  });
