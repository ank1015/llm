import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export const defaultProjectsRoot = resolve(homedir(), 'projects');
export const desktopDataRoot = join(homedir(), '.llm', 'projects');
