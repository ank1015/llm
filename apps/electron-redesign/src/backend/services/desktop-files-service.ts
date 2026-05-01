import { lstat, mkdir, readFile, readdir, rename, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';

import type {
  DesktopEntryDto,
  DesktopEntryType,
  DesktopFileDto,
  DesktopListResult,
} from '../../shared/api-contract.js';

export const desktopRoot = resolveDesktopRoot();

const FILE_READ_DEFAULT_MAX_BYTES = 512 * 1024;
const FILE_READ_MAX_BYTES = 5 * 1024 * 1024;
const PATH_NOT_FOUND_MESSAGE = 'Path not found';

export class DesktopRouteError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message);
    this.name = 'DesktopRouteError';
  }
}

function resolveDesktopRoot(): string {
  const configuredRoot = process.env['LLM_ELECTRON_DESKTOP_ROOT']?.trim();

  if (configuredRoot) {
    const expanded =
      configuredRoot === '~' ||
      configuredRoot.startsWith(`~${sep}`) ||
      configuredRoot.startsWith('~/')
        ? join(homedir(), configuredRoot.slice(1))
        : configuredRoot;

    return resolve(expanded);
  }

  return join(homedir(), 'Desktop');
}

export const resolveDesktopPath = (rawPath: string | undefined): string => {
  const trimmed = rawPath?.trim();

  if (!trimmed) {
    return desktopRoot;
  }

  const expanded =
    trimmed === '~' || trimmed.startsWith(`~${sep}`) || trimmed.startsWith('~/')
      ? join(homedir(), trimmed.slice(1))
      : trimmed;

  return isAbsolute(expanded) ? resolve(expanded) : resolve(desktopRoot, expanded);
};

export const isWithinDesktop = (targetPath: string): boolean => {
  if (targetPath === desktopRoot) {
    return true;
  }

  return targetPath.startsWith(`${desktopRoot}${sep}`);
};

export const parseMaxBytes = (rawValue: string | undefined): number => {
  if (rawValue === undefined) {
    return FILE_READ_DEFAULT_MAX_BYTES;
  }

  const parsed = Number(rawValue);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new DesktopRouteError('maxBytes must be a positive number', 400);
  }

  return Math.min(FILE_READ_MAX_BYTES, Math.max(1024, Math.floor(parsed)));
};

export const getDesktopListing = async (
  rawPath: string | undefined,
  showHidden: boolean
): Promise<DesktopListResult> => {
  const targetPath = resolveDesktopPath(rawPath);

  ensureWithinDesktop(targetPath);

  let directoryStats;
  try {
    directoryStats = await stat(targetPath);
  } catch {
    throw new DesktopRouteError(PATH_NOT_FOUND_MESSAGE, 404);
  }

  if (!directoryStats.isDirectory()) {
    throw new DesktopRouteError('Path is not a directory', 400);
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

      if (type === null) {
        return null;
      }

      try {
        const entryStats = await lstat(entryPath);

        return {
          name: entry.name,
          path: entryPath,
          type,
          size: type === 'file' ? entryStats.size : null,
          updatedAt: entryStats.mtime.toISOString(),
          isHidden: entry.name.startsWith('.'),
          isSymlink,
        };
      } catch {
        return null;
      }
    })
  );

  const entries = mapped
    .filter((entry): entry is DesktopEntryDto => entry !== null)
    .filter((entry) => showHidden || !entry.isHidden)
    .sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }

      return a.name.localeCompare(b.name);
    });

  const parentCandidate = dirname(targetPath);
  const parent =
    parentCandidate !== targetPath && isWithinDesktop(parentCandidate) ? parentCandidate : null;

  return {
    path: targetPath,
    name: basename(targetPath) || targetPath,
    parent,
    root: desktopRoot,
    isRoot: targetPath === desktopRoot,
    entries,
  };
};

export const getDesktopFile = async (
  rawPath: string | undefined,
  maxBytes: number
): Promise<DesktopFileDto> => {
  const targetPath = resolveRequiredDesktopFilePath(rawPath);
  const fileStats = await getFileStats(targetPath);
  const raw = await readFile(targetPath);
  const isBinary = looksBinary(raw);
  const truncated = !isBinary && raw.length > maxBytes;
  const content = isBinary ? '' : (truncated ? raw.subarray(0, maxBytes) : raw).toString('utf8');

  return {
    path: targetPath,
    name: basename(targetPath),
    content,
    size: raw.length,
    updatedAt: fileStats.mtime.toISOString(),
    isBinary,
    truncated,
  };
};

export const getRawDesktopFile = async (
  rawPath: string | undefined
): Promise<{ readonly content: Uint8Array; readonly contentType: string }> => {
  const targetPath = resolveRequiredDesktopFilePath(rawPath);
  await getFileStats(targetPath);
  const content = await readFile(targetPath);

  return {
    content: new Uint8Array(content),
    contentType: inferContentType(targetPath),
  };
};

export const createDesktopFolder = async (
  rawDirectoryPath: string | undefined
): Promise<DesktopEntryDto> => {
  const directoryPath = resolveDesktopPath(rawDirectoryPath);
  ensureWithinDesktop(directoryPath);

  const directoryStats = await getDirectoryStats(directoryPath);

  if (!directoryStats.isDirectory()) {
    throw new DesktopRouteError('Path is not a directory', 400);
  }

  const folderPath = await getAvailableFolderPath(directoryPath);
  await mkdir(folderPath);

  return getEntryDto(folderPath);
};

export const renameDesktopEntry = async (
  rawPath: string | undefined,
  newName: string | undefined
): Promise<DesktopEntryDto> => {
  const targetPath = resolveRequiredDesktopPath(rawPath);
  const cleanName = parseEntryName(newName);
  const nextPath = join(dirname(targetPath), cleanName);

  ensureWithinDesktop(nextPath);

  if (nextPath === targetPath) {
    return getEntryDto(targetPath);
  }

  await ensurePathAvailable(nextPath);
  await rename(targetPath, nextPath);

  return getEntryDto(nextPath);
};

const ensureWithinDesktop = (targetPath: string): void => {
  if (!isWithinDesktop(targetPath)) {
    throw new DesktopRouteError('Path is outside the allowed root', 400);
  }
};

const resolveRequiredDesktopPath = (rawPath: string | undefined): string => {
  if (!rawPath?.trim()) {
    throw new DesktopRouteError('path is required', 400);
  }

  const targetPath = resolveDesktopPath(rawPath);
  ensureWithinDesktop(targetPath);

  return targetPath;
};

const resolveRequiredDesktopFilePath = (rawPath: string | undefined): string => {
  return resolveRequiredDesktopPath(rawPath);
};

const getDirectoryStats = async (targetPath: string): Promise<Awaited<ReturnType<typeof stat>>> => {
  try {
    return await stat(targetPath);
  } catch {
    throw new DesktopRouteError(PATH_NOT_FOUND_MESSAGE, 404);
  }
};

const getFileStats = async (targetPath: string): Promise<Awaited<ReturnType<typeof stat>>> => {
  let fileStats;

  try {
    fileStats = await stat(targetPath);
  } catch {
    throw new DesktopRouteError(PATH_NOT_FOUND_MESSAGE, 404);
  }

  if (!fileStats.isFile()) {
    throw new DesktopRouteError('Path is not a file', 400);
  }

  return fileStats;
};

const getEntryDto = async (entryPath: string): Promise<DesktopEntryDto> => {
  let entryStats;
  let resolvedStats;

  try {
    entryStats = await lstat(entryPath);
    resolvedStats = await stat(entryPath);
  } catch {
    throw new DesktopRouteError(PATH_NOT_FOUND_MESSAGE, 404);
  }

  const type = classifyEntryType(resolvedStats.isDirectory(), resolvedStats.isFile());

  if (type === null) {
    throw new DesktopRouteError('Unsupported entry type', 400);
  }

  return {
    name: basename(entryPath),
    path: entryPath,
    type,
    size: type === 'file' ? entryStats.size : null,
    updatedAt: entryStats.mtime.toISOString(),
    isHidden: basename(entryPath).startsWith('.'),
    isSymlink: entryStats.isSymbolicLink(),
  };
};

const getAvailableFolderPath = async (directoryPath: string): Promise<string> => {
  const baseName = 'untitled folder';

  for (let index = 1; index < 1000; index += 1) {
    const candidateName = index === 1 ? baseName : `${baseName} ${String(index)}`;
    const candidatePath = join(directoryPath, candidateName);

    if (await isPathAvailable(candidatePath)) {
      return candidatePath;
    }
  }

  throw new DesktopRouteError('Could not find an available folder name', 409);
};

const parseEntryName = (rawName: string | undefined): string => {
  const cleanName = rawName?.trim();

  if (!cleanName) {
    throw new DesktopRouteError('Name is required', 400);
  }

  if (
    cleanName.includes('/') ||
    cleanName.includes('\\') ||
    cleanName === '.' ||
    cleanName === '..'
  ) {
    throw new DesktopRouteError('Name cannot contain path separators', 400);
  }

  return cleanName;
};

const ensurePathAvailable = async (targetPath: string): Promise<void> => {
  if (!(await isPathAvailable(targetPath))) {
    throw new DesktopRouteError('An item with that name already exists', 409);
  }
};

const isPathAvailable = async (targetPath: string): Promise<boolean> => {
  try {
    await lstat(targetPath);
    return false;
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return true;
    }

    throw error;
  }
};

const isNodeError = (value: unknown): value is NodeJS.ErrnoException =>
  value instanceof Error && 'code' in value;

const classifyEntryType = (isDirectory: boolean, isFile: boolean): DesktopEntryType | null => {
  if (isDirectory) {
    return 'directory';
  }

  if (isFile) {
    return 'file';
  }

  return null;
};

const looksBinary = (content: Buffer): boolean => {
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
};

const inferContentType = (targetPath: string): string => {
  const extension = targetPath.split('.').pop()?.toLowerCase() ?? '';

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
};
