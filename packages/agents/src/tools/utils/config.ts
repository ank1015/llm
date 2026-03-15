import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get the base directory for resolving package assets (themes, package.json, README.md, CHANGELOG.md).
 * Walks up from the current file's directory until it finds a package.json.
 */
export function getPackageDir(): string {
  let dir = __dirname;
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, 'package.json'))) {
      return dir;
    }
    dir = dirname(dir);
  }
  return __dirname;
}

/** Get path to package.json */
export function getPackageJsonPath(): string {
  return join(getPackageDir(), 'package.json');
}

const pkg = JSON.parse(readFileSync(getPackageJsonPath(), 'utf-8'));

export const APP_NAME: string = pkg.piConfig?.name || 'pi';
export const CONFIG_DIR_NAME: string = pkg.piConfig?.configDir || '.pi';

/** Get the agent config directory (e.g., ~/.pi/agent/) */
export function getAgentDir(): string {
  return join(homedir(), CONFIG_DIR_NAME, 'agent');
}

/** Get path to managed binaries directory (fd, rg) */
export function getBinDir(): string {
  return join(getAgentDir(), 'bin');
}

/** Get path to settings.json */
export function getSettingsPath(): string {
  return join(getAgentDir(), 'settings.json');
}
