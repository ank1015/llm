import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, delimiter } from 'node:path';

export interface TerminalShellLaunchConfig {
  shell: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}

function findExecutable(command: string): string | null {
  const tool = process.platform === 'win32' ? 'where' : 'which';

  try {
    const result = spawnSync(tool, [command], {
      encoding: 'utf-8',
      timeout: 5000,
    });
    if (result.status !== 0 || !result.stdout) {
      return null;
    }

    const firstMatch = result.stdout.trim().split(/\r?\n/)[0];
    return firstMatch && existsSync(firstMatch) ? firstMatch : null;
  } catch {
    return null;
  }
}

function getUnixShellConfig(): { shell: string; args: string[] } {
  const envShell = process.env['SHELL']?.trim();
  if (envShell && existsSync(envShell)) {
    return { shell: envShell, args: getLoginArgs(envShell) };
  }

  if (existsSync('/bin/bash')) {
    return { shell: '/bin/bash', args: ['-l'] };
  }

  const bashOnPath = findExecutable('bash');
  if (bashOnPath) {
    return { shell: bashOnPath, args: ['-l'] };
  }

  const shOnPath = findExecutable('sh');
  if (shOnPath) {
    return { shell: shOnPath, args: [] };
  }

  return { shell: 'sh', args: [] };
}

function getWindowsShellConfig(): { shell: string; args: string[] } {
  const comSpec = process.env['ComSpec']?.trim();
  if (comSpec && existsSync(comSpec)) {
    return { shell: comSpec, args: [] };
  }

  const powerShell = findExecutable('powershell.exe');
  if (powerShell) {
    return { shell: powerShell, args: ['-NoLogo'] };
  }

  return { shell: 'cmd.exe', args: [] };
}

function getLoginArgs(shellPath: string): string[] {
  const shellName = basename(shellPath).toLowerCase();

  if (shellName === 'bash' || shellName === 'zsh') {
    return ['-l'];
  }

  if (shellName === 'fish') {
    return ['--login'];
  }

  return [];
}

function getPathKey(env: NodeJS.ProcessEnv): string {
  return Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
}

export function getTerminalShellLaunchConfig(): TerminalShellLaunchConfig {
  const shellConfig = process.platform === 'win32' ? getWindowsShellConfig() : getUnixShellConfig();
  const env = { ...process.env };
  const pathKey = getPathKey(env);
  const currentPath = env[pathKey] ?? '';
  const pathEntries = currentPath.split(delimiter).filter(Boolean);

  env[pathKey] = pathEntries.join(delimiter);
  env['TERM'] = env['TERM']?.trim() || 'xterm-256color';
  env['COLORTERM'] = env['COLORTERM']?.trim() || 'truecolor';
  env['TERM_PROGRAM'] = env['TERM_PROGRAM']?.trim() || 'llm-web-terminal';

  return {
    ...shellConfig,
    env,
  };
}
