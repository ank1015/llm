import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { defaultProjectsRoot } from './desktop-paths.js';

import type { DesktopState } from '../shared/desktop-api.js';

const statePath = join(homedir(), '.llm', 'desktop.json');

export const getDesktopState = async (): Promise<DesktopState> => {
  try {
    const raw = await readFile(statePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;

    if (isDesktopState(parsed)) {
      return parsed;
    }
  } catch (error) {
    if (!isNodeError(error) || error.code !== 'ENOENT') {
      throw error;
    }
  }

  return createInitialState();
};

export const markSetupComplete = async (projectsRoot: string): Promise<DesktopState> => {
  const state: DesktopState = {
    projectsRoot,
    setupComplete: true,
    setupCompletedAt: new Date().toISOString(),
    statePath,
  };

  await mkdir(dirname(statePath), { recursive: true, mode: 0o700 });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });

  return state;
};

const createInitialState = (): DesktopState => ({
  projectsRoot: defaultProjectsRoot,
  setupComplete: false,
  statePath,
});

const isDesktopState = (value: unknown): value is DesktopState => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return typeof record['setupComplete'] === 'boolean' && typeof record['projectsRoot'] === 'string';
};

const isNodeError = (value: unknown): value is NodeJS.ErrnoException =>
  value instanceof Error && 'code' in value;
