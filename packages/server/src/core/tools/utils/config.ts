import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';

/**
 * Get the base directory for resolving package assets (themes, package.json, README.md, CHANGELOG.md).
 * - For Bun binary: returns the directory containing the executable
 * - For Node.js (dist/): returns __dirname (the dist/ directory)
 * - For tsx (src/): returns parent directory (the package root)
 */
export function getPackageDir(): string {
  // Node.js: walk up from __dirname until we find package.json
  let dir = __dirname;
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, 'package.json'))) {
      return dir;
    }
    dir = dirname(dir);
  }
  // Fallback (shouldn't happen)
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
