import { execFile } from 'node:child_process';
import { platform } from 'node:os';
import { promisify } from 'node:util';

import type { SetupCheck, SetupCheckName } from '../shared/desktop-api.js';

const execFileAsync = promisify(execFile);
const chromeControllerCommand = 'chrome-controller';

const setupChecks: Array<{
  readonly name: SetupCheckName;
  readonly label: string;
  readonly commands: readonly string[];
}> = [
  {
    name: 'node',
    label: 'Node.js',
    commands: ['node'],
  },
  {
    name: 'npx',
    label: 'npx',
    commands: ['npx'],
  },
  {
    name: 'python',
    label: 'Python',
    commands: ['python3', 'python'],
  },
  {
    name: 'git',
    label: 'Git',
    commands: ['git'],
  },
  {
    name: chromeControllerCommand,
    label: chromeControllerCommand,
    commands: [chromeControllerCommand],
  },
];

export const checkSetupRequirements = async (): Promise<SetupCheck[]> =>
  Promise.all(setupChecks.map(async (check) => checkRequirement(check)));

const checkRequirement = async (check: (typeof setupChecks)[number]): Promise<SetupCheck> => {
  for (const command of check.commands) {
    const result = await checkCommand(command);

    if (result.installed) {
      return {
        name: check.name,
        label: check.label,
        command,
        installed: true,
        ...(result.version ? { version: result.version } : {}),
        ...(result.executablePath ? { executablePath: result.executablePath } : {}),
      };
    }
  }

  return {
    name: check.name,
    label: check.label,
    command: check.commands.join(' / '),
    installed: false,
  };
};

const checkCommand = async (
  command: string
): Promise<{
  readonly installed: boolean;
  readonly version?: string;
  readonly executablePath?: string;
}> => {
  try {
    const { stdout, stderr } = await execFileAsync(getShell(), getShellArgs(command), {
      timeout: 10_000,
    });
    const lines = (stdout || stderr)
      .trim()
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const executablePath = lines[0];
    const version = lines[1];

    return {
      installed: true,
      ...(executablePath ? { executablePath } : {}),
      ...(version ? { version } : {}),
    };
  } catch {
    return { installed: false };
  }
};

const getShell = (): string => {
  if (platform() === 'win32') {
    return 'cmd.exe';
  }

  return process.env.SHELL || '/bin/zsh';
};

const getShellArgs = (command: string): string[] => {
  if (platform() === 'win32') {
    return ['/d', '/s', '/c', `where ${command} && ${command} --version`];
  }

  return ['-lc', `command -v ${command} && ${command} --version`];
};
