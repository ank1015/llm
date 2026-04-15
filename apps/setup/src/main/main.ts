import { execFile, spawn } from 'node:child_process';
import { platform } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { app, BrowserWindow, ipcMain, shell } from 'electron';

import type { DependencyCheck, DependencyName, LaunchResult } from '../shared/setup-api.js';

const execFileAsync = promisify(execFile);

const dependencyChecks: Array<{
  readonly name: DependencyName;
  readonly label: string;
  readonly commands: readonly string[];
  readonly installUrl: string;
}> = [
  {
    name: 'git',
    label: 'Git',
    commands: ['git'],
    installUrl: 'https://git-scm.com/downloads',
  },
  {
    name: 'node',
    label: 'Node.js',
    commands: ['node'],
    installUrl: 'https://nodejs.org/en/download',
  },
  {
    name: 'python',
    label: 'Python',
    commands: ['python3', 'python'],
    installUrl: 'https://www.python.org/downloads/',
  },
];

const createWindow = (): void => {
  const window = new BrowserWindow({
    width: 960,
    height: 680,
    minWidth: 780,
    minHeight: 560,
    title: 'LLM Setup',
    backgroundColor: '#f6f3ed',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(app.getAppPath(), 'dist/preload/preload.cjs'),
    },
  });

  void window.loadFile(join(app.getAppPath(), 'dist/renderer/index.html'));
};

const checkDependency = async (
  check: (typeof dependencyChecks)[number]
): Promise<DependencyCheck> => {
  for (const command of check.commands) {
    const result = await checkCommand(command);

    if (result.installed) {
      return {
        name: check.name,
        label: check.label,
        command,
        installed: true,
        installUrl: check.installUrl,
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
    installUrl: check.installUrl,
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

const registerIpcHandlers = (): void => {
  ipcMain.handle(
    'setup:check-dependencies',
    async (): Promise<DependencyCheck[]> =>
      Promise.all(dependencyChecks.map(async (check) => checkDependency(check)))
  );

  ipcMain.handle('setup:launch-main-app', async (): Promise<LaunchResult> => {
    const checks = await Promise.all(dependencyChecks.map(async (check) => checkDependency(check)));
    const missing = checks.filter((check) => !check.installed);

    if (missing.length > 0) {
      return {
        ok: false,
        message: `Install ${missing.map((check) => check.label).join(', ')} before launching.`,
      };
    }

    try {
      const child = spawn('npx', ['@ank1015/llm'], {
        detached: true,
        stdio: 'ignore',
      });

      child.unref();

      return {
        ok: true,
        message: 'Main app launch command started successfully.',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown launch error';

      return {
        ok: false,
        message,
      };
    }
  });
};

registerIpcHandlers();

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);

    return { action: 'deny' };
  });
});
