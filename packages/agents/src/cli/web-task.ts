#!/usr/bin/env node

import { runFetchNMailsCli } from '../helpers/web/scripts/gmail/fetch-n-mails.js';
import { isMainModule } from '../utils/is-main-module.js';

export interface WebTaskCliArgs {
  area: string;
  command: string;
  commandArgs: string[];
}

const WEB_TASK_COMMANDS = ['gmail fetch-n-mails'] as const;

export function parseWebTaskCliArgs(argv: string[]): WebTaskCliArgs {
  const args = argv.filter((value) => value.trim().length > 0);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    throw new Error(createWebTaskUsage());
  }

  const [area, command, ...commandArgs] = args;
  if (!area || !command) {
    throw new Error(createWebTaskUsage());
  }

  return {
    area,
    command,
    commandArgs,
  };
}

export async function runWebTaskCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const { area, command, commandArgs } = parseWebTaskCliArgs(argv);

  if (area === 'gmail' && command === 'fetch-n-mails') {
    await runFetchNMailsCli(commandArgs);
    return;
  }

  throw new Error(`Unknown web task command: ${area} ${command}\n\n${createWebTaskUsage()}`);
}

function createWebTaskUsage(): string {
  return `Usage:
  web-task <area> <command> [options]

Available commands:
  ${WEB_TASK_COMMANDS.join('\n  ')}

Examples:
  web-task gmail fetch-n-mails --count 5
  web-task gmail fetch-n-mails --count 10 --no-launch`;
}

if (isMainModule(import.meta.url)) {
  runWebTaskCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
