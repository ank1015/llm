import { mkdir, readFile, writeFile, readdir, rm, access, stat } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Create directory if it doesn't exist.
 * Equivalent to mkdir -p.
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

/**
 * Check if a path exists on disk.
 */
export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read and parse a JSON file.
 * @throws If file doesn't exist or contains invalid JSON.
 */
export async function readJson<T>(filePath: string): Promise<T> {
  const content = await readFile(filePath, 'utf-8');
  return JSON.parse(content) as T;
}

/**
 * Serialize data and write to a JSON file.
 * Creates parent directories if needed.
 */
export async function writeJson(filePath: string, data: unknown): Promise<void> {
  const dir = filePath.substring(0, filePath.lastIndexOf('/'));
  if (dir) {
    await ensureDir(dir);
  }
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * List subdirectories in a given path.
 * Returns directory names (not full paths).
 */
export async function listDirs(dirPath: string): Promise<string[]> {
  const exists = await pathExists(dirPath);
  if (!exists) return [];

  const entries = await readdir(dirPath, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

/**
 * List files in a given path.
 * Returns file names (not full paths).
 * Optionally exclude specific filenames.
 */
export async function listFiles(dirPath: string, exclude: string[] = []): Promise<string[]> {
  const exists = await pathExists(dirPath);
  if (!exists) return [];

  const entries = await readdir(dirPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && !exclude.includes(entry.name))
    .map((entry) => entry.name);
}

/**
 * Remove a directory recursively.
 * No-op if the directory doesn't exist.
 */
export async function removeDir(dirPath: string): Promise<void> {
  const exists = await pathExists(dirPath);
  if (!exists) return;
  await rm(dirPath, { recursive: true, force: true });
}

/**
 * Get file/directory stats.
 * Returns null if path doesn't exist.
 */
export async function getStats(
  targetPath: string
): Promise<Awaited<ReturnType<typeof stat>> | null> {
  try {
    return await stat(targetPath);
  } catch {
    return null;
  }
}

/** Metadata filename convention used across project and artifact dirs */
export const METADATA_FILE = 'metadata.json';

/**
 * Read metadata.json from a directory.
 * @throws If metadata file doesn't exist.
 */
export async function readMetadata<T>(dirPath: string): Promise<T> {
  return readJson<T>(join(dirPath, METADATA_FILE));
}

/**
 * Write metadata.json to a directory.
 */
export async function writeMetadata(dirPath: string, data: unknown): Promise<void> {
  await writeJson(join(dirPath, METADATA_FILE), data);
}
