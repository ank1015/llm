import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function canonicalizePath(path: string): string | undefined {
  try {
    return realpathSync(path);
  } catch {
    try {
      return resolve(path);
    } catch {
      return undefined;
    }
  }
}

export function isMainModule(
  importMetaUrl: string,
  argv1: string | undefined = process.argv[1]
): boolean {
  if (!argv1) {
    return false;
  }

  const modulePath = canonicalizePath(fileURLToPath(importMetaUrl));
  const entryPath = canonicalizePath(resolve(argv1));

  return modulePath !== undefined && entryPath !== undefined && modulePath === entryPath;
}
