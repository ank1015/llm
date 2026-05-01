import { chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../../src/app.js';
import { getConfig, setConfig } from '../../../src/core/config.js';

let binRoot: string;
let homeRoot: string;
const originalConfig = getConfig();

beforeEach(async () => {
  binRoot = await mkdtemp(join(tmpdir(), 'llm-server-setup-bin-'));
  homeRoot = await mkdtemp(join(tmpdir(), 'llm-server-setup-home-'));
  const shellPath = await writeShell();

  vi.stubEnv('HOME', homeRoot);
  vi.stubEnv('PATH', binRoot);
  vi.stubEnv('SHELL', shellPath);
  setConfig({ projectsRoot: join(homeRoot, 'projects') });
});

afterEach(async () => {
  setConfig(originalConfig);
  vi.unstubAllEnvs();
  await rm(binRoot, { recursive: true, force: true });
  await rm(homeRoot, { recursive: true, force: true });
});

describe('setup routes', () => {
  it('returns incomplete setup status when desktop state and dependencies are missing', async () => {
    const app = createApp();
    const response = await app.request('/api/setup/status');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      setupComplete: false,
      statePath: join(homeRoot, '.llm', 'desktop.json'),
      projectsRoot: join(homeRoot, 'projects'),
      ready: false,
      checks: [
        { name: 'node', label: 'Node.js', command: 'node', installed: false },
        { name: 'npx', label: 'npx', command: 'npx', installed: false },
        { name: 'python', label: 'Python', command: 'python3 / python', installed: false },
        { name: 'git', label: 'Git', command: 'git', installed: false },
        {
          name: 'chrome-controller',
          label: 'chrome-controller',
          command: 'chrome-controller',
          installed: false,
        },
      ],
    });
  });

  it('refuses to save setup completion when dependencies are missing', async () => {
    const app = createApp();
    const response = await app.request('/api/setup/complete', { method: 'POST' });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      message?: string;
      status: { ready: boolean; setupComplete: boolean };
    };

    expect(body).toMatchObject({
      ok: false,
      message: 'Install missing setup requirements before continuing.',
      status: {
        ready: false,
        setupComplete: false,
      },
    });
    await expect(readFile(join(homeRoot, '.llm', 'desktop.json'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('saves setup completion when all dependencies are installed', async () => {
    await Promise.all([
      writeCommand('node', 'v25.0.0'),
      writeCommand('npx', '11.0.0'),
      writeCommand('python3', 'Python 3.13.0'),
      writeCommand('git', 'git version 2.50.0'),
      writeCommand('chrome-controller', '1.0.0'),
    ]);

    const app = createApp();
    const response = await app.request('/api/setup/complete', { method: 'POST' });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      status: {
        checks: Array<{ installed: boolean }>;
        projectsRoot: string;
        ready: boolean;
        setupComplete: boolean;
        setupCompletedAt?: string;
      };
    };

    expect(body.ok).toBe(true);
    expect(body.status).toMatchObject({
      projectsRoot: join(homeRoot, 'projects'),
      ready: true,
      setupComplete: true,
    });
    expect(body.status.setupCompletedAt).toEqual(expect.any(String));
    expect(body.status.checks.every((check) => check.installed)).toBe(true);

    const statePath = join(homeRoot, '.llm', 'desktop.json');
    const saved = JSON.parse(await readFile(statePath, 'utf8')) as {
      projectsRoot: string;
      setupComplete: boolean;
      setupCompletedAt?: string;
      statePath: string;
    };
    expect(saved).toMatchObject({
      projectsRoot: join(homeRoot, 'projects'),
      setupComplete: true,
      statePath,
    });
    expect((await stat(statePath)).mode & 0o777).toBe(0o600);
  });
});

async function writeCommand(command: string, version: string): Promise<void> {
  const path = join(binRoot, command);

  await writeFile(path, `#!/bin/sh\nprintf '%s\\n' '${version}'\n`);
  await chmod(path, 0o755);
}

async function writeShell(): Promise<string> {
  const path = join(binRoot, 'test-shell');

  await writeFile(
    path,
    `#!/bin/sh\nif [ "$1" = "-lc" ]; then\n  shift\nfi\nexec /bin/sh -c "$1"\n`
  );
  await chmod(path, 0o755);

  return path;
}
