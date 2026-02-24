import { homedir } from 'node:os';
import { join } from 'node:path';

export interface AppConfig {
  /** Root directory where project working directories are created */
  projectsRoot: string;
  /** Root directory where project metadata is stored */
  dataRoot: string;
}

const home = homedir();

const defaultConfig: AppConfig = {
  projectsRoot: join(home, 'projects'),
  dataRoot: join(home, '.llm', 'projects'),
};

let currentConfig: AppConfig = { ...defaultConfig };

/** Get the current app config */
export function getConfig(): AppConfig {
  return currentConfig;
}

/**
 * Override config values. Merges with current config.
 * Call this at server startup if you need custom paths.
 */
export function setConfig(overrides: Partial<AppConfig>): void {
  currentConfig = { ...currentConfig, ...overrides };
}
