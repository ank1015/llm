import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { arch, homedir, platform, release } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

import { getConfig } from './config.js';

import type {
  SetupCheck,
  SetupCheckName,
  SetupRequirementsContext,
  SetupRuntimeContext,
  SetupCompleteResult,
  SetupStatus,
} from '../contracts/index.js';

type DesktopState = {
  readonly projectsRoot: string;
  readonly setupComplete: boolean;
  readonly setupCompletedAt?: string;
  readonly statePath: string;
};

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

export const getSetupStatus = async (): Promise<SetupStatus> => {
  const [state, checks] = await Promise.all([readDesktopState(), checkSetupRequirements()]);

  return {
    projectsRoot: state.projectsRoot,
    setupComplete: state.setupComplete,
    statePath: state.statePath,
    checks,
    ready: checks.every((check) => check.installed),
    ...(state.setupCompletedAt ? { setupCompletedAt: state.setupCompletedAt } : {}),
  };
};

export const getSetupRequirementsContext = async (): Promise<SetupRequirementsContext> => {
  const status = await getSetupStatus();

  return {
    status,
    missing: status.checks.filter((check) => !check.installed),
    runtime: getSetupRuntimeContext(),
  };
};

export const completeSetup = async (): Promise<SetupCompleteResult> => {
  const status = await getSetupStatus();

  if (!status.ready) {
    return {
      ok: false,
      message: 'Install missing setup requirements before continuing.',
      status,
    };
  }

  const state = await writeDesktopState(status.projectsRoot);

  return {
    ok: true,
    status: {
      projectsRoot: state.projectsRoot,
      setupComplete: state.setupComplete,
      statePath: state.statePath,
      checks: status.checks,
      ready: true,
      ...(state.setupCompletedAt ? { setupCompletedAt: state.setupCompletedAt } : {}),
    },
  };
};

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

  return process.env['SHELL'] || '/bin/zsh';
};

const getSetupRuntimeContext = (): SetupRuntimeContext => {
  const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
  const shell = platform() === 'win32' ? process.env['ComSpec'] : process.env['SHELL'];
  const pathValue = process.env[pathKey];

  return {
    platform: platform(),
    arch: arch(),
    release: release(),
    ...(shell ? { shell } : {}),
    ...(pathValue ? { path: pathValue } : {}),
  };
};

const getShellArgs = (command: string): string[] => {
  if (platform() === 'win32') {
    return ['/d', '/s', '/c', `where ${command} && ${command} --version`];
  }

  return ['-lc', `command -v ${command} && ${command} --version`];
};

const readDesktopState = async (): Promise<DesktopState> => {
  try {
    const raw = await readFile(getDesktopStatePath(), 'utf8');
    const parsed = JSON.parse(raw) as unknown;

    if (isDesktopState(parsed)) {
      return {
        projectsRoot: parsed.projectsRoot,
        setupComplete: parsed.setupComplete,
        statePath: getDesktopStatePath(),
        ...(parsed.setupCompletedAt ? { setupCompletedAt: parsed.setupCompletedAt } : {}),
      };
    }
  } catch (error) {
    if (!isNodeError(error) || error.code !== 'ENOENT') {
      throw error;
    }
  }

  return createInitialState();
};

const writeDesktopState = async (projectsRoot: string): Promise<DesktopState> => {
  const state: DesktopState = {
    projectsRoot,
    setupComplete: true,
    setupCompletedAt: new Date().toISOString(),
    statePath: getDesktopStatePath(),
  };

  await mkdir(dirname(state.statePath), { recursive: true, mode: 0o700 });
  await writeFile(state.statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });

  return state;
};

const createInitialState = (): DesktopState => ({
  projectsRoot: getConfig().projectsRoot,
  setupComplete: false,
  statePath: getDesktopStatePath(),
});

const getDesktopStatePath = (): string => join(homedir(), '.llm', 'desktop.json');

const isDesktopState = (value: unknown): value is DesktopState => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return typeof record['setupComplete'] === 'boolean' && typeof record['projectsRoot'] === 'string';
};

const isNodeError = (value: unknown): value is NodeJS.ErrnoException =>
  value instanceof Error && 'code' in value;
