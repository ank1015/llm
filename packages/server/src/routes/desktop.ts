import { lstat, readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';

import { Hono } from 'hono';

import { DesktopListQuerySchema } from '../contracts/index.js';
import { validateSchema } from '../http/validation.js';

import type {
  DesktopEntryDto,
  DesktopEntryTypeDto,
  DesktopListQuery,
  DesktopListResult,
} from '../contracts/index.js';

export const desktopRoutes = new Hono();

const HOME_DIR = homedir();
const DESKTOP_ROOT = join(HOME_DIR, 'Desktop');
const INVALID_QUERY_MESSAGE = 'Invalid query parameters';
const PATH_NOT_FOUND_MESSAGE = 'Path not found';
const PATH_NOT_DIRECTORY_MESSAGE = 'Path is not a directory';
const PATH_OUT_OF_BOUNDS_MESSAGE = 'Path is outside the allowed root';

/** Confines navigation to the Desktop subtree (Desktop itself and any descendant). */
function isWithinDesktop(target: string): boolean {
  if (target === DESKTOP_ROOT) {
    return true;
  }
  return target.startsWith(`${DESKTOP_ROOT}${sep}`);
}

/**
 * Resolves the requested path to a normalized absolute path. Anything that
 * would resolve outside `~/Desktop` is rejected by the route handler.
 */
function resolveRequestedPath(rawPath: string | undefined): string {
  const trimmed = rawPath?.trim();
  if (!trimmed) {
    return DESKTOP_ROOT;
  }

  const expanded =
    trimmed === '~' || trimmed.startsWith(`~${sep}`) || trimmed.startsWith('~/')
      ? join(HOME_DIR, trimmed.slice(1))
      : trimmed;

  return isAbsolute(expanded) ? resolve(expanded) : resolve(DESKTOP_ROOT, expanded);
}

function isHiddenName(name: string): boolean {
  return name.startsWith('.');
}

function classifyEntryType(
  isDirectory: boolean,
  isFile: boolean
): DesktopEntryTypeDto | null {
  if (isDirectory) {
    return 'directory';
  }
  if (isFile) {
    return 'file';
  }
  return null;
}

/** GET /api/desktop/list — List entries in a directory under the user's home tree. */
desktopRoutes.get('/desktop/list', async (c) => {
  const queryValidation = validateSchema(
    c,
    DesktopListQuerySchema,
    c.req.query(),
    INVALID_QUERY_MESSAGE
  );
  if (!queryValidation.ok) {
    return queryValidation.response;
  }

  const queryParams = queryValidation.value as DesktopListQuery;
  const showHidden = queryParams.showHidden === 'true' || queryParams.showHidden === '1';
  const targetPath = resolveRequestedPath(queryParams.path);

  if (!isWithinDesktop(targetPath)) {
    return c.json({ error: PATH_OUT_OF_BOUNDS_MESSAGE }, 400);
  }

  let directoryStats;
  try {
    directoryStats = await stat(targetPath);
  } catch {
    return c.json({ error: PATH_NOT_FOUND_MESSAGE }, 404);
  }

  if (!directoryStats.isDirectory()) {
    return c.json({ error: PATH_NOT_DIRECTORY_MESSAGE }, 400);
  }

  const dirEntries = await readdir(targetPath, { withFileTypes: true });

  const mapped = await Promise.all(
    dirEntries.map(async (entry): Promise<DesktopEntryDto | null> => {
      const entryPath = join(targetPath, entry.name);

      const isSymlink = entry.isSymbolicLink();
      let resolvedIsDirectory = entry.isDirectory();
      let resolvedIsFile = entry.isFile();

      if (isSymlink) {
        try {
          const resolvedStats = await stat(entryPath);
          resolvedIsDirectory = resolvedStats.isDirectory();
          resolvedIsFile = resolvedStats.isFile();
        } catch {
          return null;
        }
      }

      const type = classifyEntryType(resolvedIsDirectory, resolvedIsFile);
      if (!type) {
        return null;
      }

      let size: number | null = null;
      let updatedAt = new Date(0).toISOString();
      try {
        const entryStats = await lstat(entryPath);
        updatedAt = entryStats.mtime.toISOString();
        if (type === 'file') {
          size = entryStats.size;
        }
      } catch {
        return null;
      }

      return {
        name: entry.name,
        path: entryPath,
        type,
        size,
        updatedAt,
        isHidden: isHiddenName(entry.name),
        isSymlink,
      };
    })
  );

  const visible = mapped
    .filter((entry): entry is DesktopEntryDto => entry !== null)
    .filter((entry) => showHidden || !entry.isHidden)
    .sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

  const parentCandidate = dirname(targetPath);
  const parentPath =
    parentCandidate !== targetPath && isWithinDesktop(parentCandidate) ? parentCandidate : null;

  const result: DesktopListResult = {
    path: targetPath,
    name: basename(targetPath) || targetPath,
    parent: parentPath,
    root: DESKTOP_ROOT,
    isRoot: targetPath === DESKTOP_ROOT,
    entries: visible,
  };

  return c.json<DesktopListResult>(result);
});
