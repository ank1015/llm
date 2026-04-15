import { execFile, spawn } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { app, BrowserWindow, ipcMain, shell } from 'electron';

import type { DependencyCheck, DependencyName, LaunchResult } from '../shared/setup-api.js';

const execFileAsync = promisify(execFile);

const dependencyChecks: Array<{
  readonly name: DependencyName;
  readonly label: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly installUrl: string;
}> = [
  {
    name: 'git',
    label: 'Git',
    command: 'git',
    args: ['--version'],
    installUrl: 'https://git-scm.com/downloads',
  },
  {
    name: 'node',
    label: 'Node.js',
    command: 'node',
    args: ['--version'],
    installUrl: 'https://nodejs.org/en/download',
  },
  {
    name: 'npm',
    label: 'npm',
    command: 'npm',
    args: ['--version'],
    installUrl: 'https://docs.npmjs.com/downloading-and-installing-node-js-and-npm',
  },
  {
    name: 'npx',
    label: 'npx',
    command: 'npx',
    args: ['--version'],
    installUrl: 'https://docs.npmjs.com/cli/v10/commands/npx',
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
      preload: join(app.getAppPath(), 'dist/preload/preload.js'),
    },
  });

  void window.loadFile(join(app.getAppPath(), 'dist/renderer/index.html'));
};

const checkDependency = async (
  check: (typeof dependencyChecks)[number]
): Promise<DependencyCheck> => {
  try {
    const { stdout, stderr } = await execFileAsync(check.command, [...check.args], {
      timeout: 10_000,
    });
    const version = (stdout || stderr).trim().split('\n')[0];

    const result: DependencyCheck = {
      name: check.name,
      label: check.label,
      command: check.command,
      installed: true,
      installUrl: check.installUrl,
    };

    if (version) {
      return { ...result, version };
    }

    return result;
  } catch {
    return {
      name: check.name,
      label: check.label,
      command: check.command,
      installed: false,
      installUrl: check.installUrl,
    };
  }
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
