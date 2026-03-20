#!/usr/bin/env node

import { runComposeDraftCli } from '../helpers/web/scripts/gmail/compose-draft.js';
import { runFetchNMailsCli } from '../helpers/web/scripts/gmail/fetch-n-mails.js';
import { runGetEmailCli } from '../helpers/web/scripts/gmail/get-email.js';
import { runReplyToEmailCli } from '../helpers/web/scripts/gmail/reply-to-email.js';
import { runSearchInboxCli } from '../helpers/web/scripts/gmail/search-inbox.js';
import { runGoogleSearchCli } from '../helpers/web/scripts/google/search.js';
import { isMainModule } from '../utils/is-main-module.js';

export interface WebTaskCliArgs {
  area: string;
  command: string;
  commandArgs: string[];
}

const WEB_TASK_COMMANDS = [
  'google search',
  'gmail fetch-n-mails',
  'gmail search-inbox',
  'gmail get-email',
  'gmail compose-draft',
  'gmail reply-to-email',
] as const;

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

  if (area === 'google' && command === 'search') {
    await runGoogleSearchCli(commandArgs);
    return;
  }

  if (area === 'gmail' && command === 'fetch-n-mails') {
    await runFetchNMailsCli(commandArgs);
    return;
  }

  if (area === 'gmail' && command === 'search-inbox') {
    await runSearchInboxCli(commandArgs);
    return;
  }

  if (area === 'gmail' && command === 'get-email') {
    await runGetEmailCli(commandArgs);
    return;
  }

  if (area === 'gmail' && command === 'compose-draft') {
    await runComposeDraftCli(commandArgs);
    return;
  }

  if (area === 'gmail' && command === 'reply-to-email') {
    await runReplyToEmailCli(commandArgs);
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
  web-task google search --query "openai" --count 5
  web-task google search --query "sdk" --site openai.com --language English --count 10
  web-task gmail fetch-n-mails --count 5
  web-task gmail fetch-n-mails --count 10 --no-launch
  web-task gmail search-inbox --query "digitalocean" --count 5
  web-task gmail get-email --url "https://mail.google.com/mail/u/0/#inbox/19d09010e9d7747f"
  web-task gmail compose-draft --to "person@example.com" --subject "Hello" --body "Draft body"
  web-task gmail reply-to-email --url "https://mail.google.com/mail/u/0/#inbox/19d09010e9d7747f" --body "Thanks for the update."`;
}

if (isMainModule(import.meta.url)) {
  runWebTaskCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
