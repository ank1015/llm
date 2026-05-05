import { lstat, readFile, readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';

import { Hono } from 'hono';

import { DesktopFileQuerySchema, DesktopListQuerySchema } from '../contracts/index.js';
import { validateSchema } from '../http/validation.js';

import type {
  DesktopEntryDto,
  DesktopEntryTypeDto,
  DesktopFileDto,
  DesktopFileQuery,
  DesktopListQuery,
  DesktopListResult,
} from '../contracts/index.js';

export const desktopRoutes = new Hono();

const HOME_DIR = homedir();
const DESKTOP_ROOT = join(HOME_DIR, 'Desktop');
const INVALID_QUERY_MESSAGE = 'Invalid query parameters';
const PATH_NOT_FOUND_MESSAGE = 'Path not found';
const PATH_NOT_DIRECTORY_MESSAGE = 'Path is not a directory';
const PATH_NOT_FILE_MESSAGE = 'Path is not a file';
const PATH_OUT_OF_BOUNDS_MESSAGE = 'Path is outside the allowed root';
const PATH_QUERY_REQUIRED_MESSAGE = 'path is required';
const FILE_READ_DEFAULT_MAX_BYTES = 512 * 1024;
const FILE_READ_MAX_BYTES = 5 * 1024 * 1024;

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

function parseMaxBytes(rawValue: string | undefined): number | null {
  if (rawValue === undefined) {
    return FILE_READ_DEFAULT_MAX_BYTES;
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.min(FILE_READ_MAX_BYTES, Math.max(1024, Math.floor(parsed)));
}

function looksBinary(content: Buffer): boolean {
  if (content.length === 0) {
    return false;
  }

  const sample = content.subarray(0, Math.min(content.length, 2048));
  let suspicious = 0;

  for (const byte of sample) {
    if (byte === 0) {
      return true;
    }

    const isTabOrNewline = byte === 9 || byte === 10 || byte === 13;
    const isControl = byte < 32 || byte === 127;

    if (isControl && !isTabOrNewline) {
      suspicious += 1;
    }
  }

  return suspicious / sample.length > 0.3;
}

function inferContentType(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase() ?? '';

  switch (extension) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'svg':
      return 'image/svg+xml';
    case 'bmp':
      return 'image/bmp';
    case 'pdf':
      return 'application/pdf';
    case 'csv':
      return 'text/csv; charset=utf-8';
    case 'tsv':
      return 'text/tab-separated-values; charset=utf-8';
    case 'md':
      return 'text/markdown; charset=utf-8';
    case 'json':
      return 'application/json; charset=utf-8';
    case 'mp4':
      return 'video/mp4';
    case 'webm':
      return 'video/webm';
    case 'mov':
      return 'video/quicktime';
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    case 'ogg':
      return 'audio/ogg';
    case 'txt':
    case 'log':
      return 'text/plain; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}

function classifyEntryType(isDirectory: boolean, isFile: boolean): DesktopEntryTypeDto | null {
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

/** GET /api/desktop/file?path=... — Read a Desktop file preview payload. */
desktopRoutes.get('/desktop/file', async (c) => {
  const queryValidation = validateSchema(
    c,
    DesktopFileQuerySchema,
    c.req.query(),
    INVALID_QUERY_MESSAGE
  );
  if (!queryValidation.ok) {
    return queryValidation.response;
  }

  const queryParams = queryValidation.value as DesktopFileQuery;
  const targetPath = resolveRequestedPath(queryParams.path);
  const maxBytes = parseMaxBytes(queryParams.maxBytes);

  if (!queryParams.path?.trim()) {
    return c.json({ error: PATH_QUERY_REQUIRED_MESSAGE }, 400);
  }
  if (maxBytes === null) {
    return c.json({ error: 'maxBytes must be a positive number' }, 400);
  }
  if (!isWithinDesktop(targetPath)) {
    return c.json({ error: PATH_OUT_OF_BOUNDS_MESSAGE }, 400);
  }

  let fileStats;
  try {
    fileStats = await stat(targetPath);
  } catch {
    return c.json({ error: PATH_NOT_FOUND_MESSAGE }, 404);
  }

  if (!fileStats.isFile()) {
    return c.json({ error: PATH_NOT_FILE_MESSAGE }, 400);
  }

  const raw = await readFile(targetPath);
  const isBinary = looksBinary(raw);
  const truncated = !isBinary && raw.length > maxBytes;
  const content = isBinary ? '' : (truncated ? raw.subarray(0, maxBytes) : raw).toString('utf-8');

  const result: DesktopFileDto = {
    path: targetPath,
    name: basename(targetPath),
    content,
    size: raw.length,
    updatedAt: fileStats.mtime.toISOString(),
    isBinary,
    truncated,
  };

  return c.json<DesktopFileDto>(result);
});

/** GET /api/desktop/file/raw?path=... — Stream raw Desktop file bytes for media previews. */
desktopRoutes.get('/desktop/file/raw', async (c) => {
  const queryValidation = validateSchema(
    c,
    DesktopFileQuerySchema,
    c.req.query(),
    INVALID_QUERY_MESSAGE
  );
  if (!queryValidation.ok) {
    return queryValidation.response;
  }

  const queryParams = queryValidation.value as DesktopFileQuery;
  const targetPath = resolveRequestedPath(queryParams.path);

  if (!queryParams.path?.trim()) {
    return c.json({ error: PATH_QUERY_REQUIRED_MESSAGE }, 400);
  }
  if (!isWithinDesktop(targetPath)) {
    return c.json({ error: PATH_OUT_OF_BOUNDS_MESSAGE }, 400);
  }

  let fileStats;
  try {
    fileStats = await stat(targetPath);
  } catch {
    return c.json({ error: PATH_NOT_FOUND_MESSAGE }, 404);
  }

  if (!fileStats.isFile()) {
    return c.json({ error: PATH_NOT_FILE_MESSAGE }, 400);
  }

  const raw = await readFile(targetPath);
  return new Response(new Uint8Array(raw), {
    status: 200,
    headers: {
      'Content-Type': inferContentType(targetPath),
      'Content-Length': `${raw.length}`,
      'Cache-Control': 'no-store',
      'X-Desktop-Path': targetPath,
    },
  });
});
