import { readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';

import { getConfig } from '../config.js';
import {
  ensureDir,
  pathExists,
  removeDir,
  readMetadata,
  writeMetadata,
  listDirs,
  listFiles,
} from '../storage/fs.js';

import type {
  ArtifactDirMetadata,
  ArtifactExplorerEntry,
  ArtifactExplorerEntryType,
  ArtifactExplorerResult,
  ArtifactFileIndexResult,
  ArtifactFileResult,
  CreateArtifactDirInput,
} from '../types.js';

const DEFAULT_MAX_FILE_BYTES = 200_000;
const MAX_ALLOWED_FILE_BYTES = 2_000_000;

/**
 * Manages a single artifact directory within a project.
 *
 * Like Project, an artifact dir has two locations:
 * - dirPath: working directory where agents write artifacts (~/projects/{projectId}/{id})
 * - dataPath: metadata storage (~/.llm/projects/{projectId}/artifacts/{id})
 */
export class ArtifactDir {
  constructor(
    /** Absolute path to the artifact working directory */
    readonly dirPath: string,
    /** Absolute path to the artifact metadata directory */
    readonly dataPath: string
  ) {}

  /**
   * Create a new artifact directory within a project.
   */
  static async create(projectId: string, input: CreateArtifactDirInput): Promise<ArtifactDir> {
    const { projectsRoot, dataRoot } = getConfig();
    const id = slugify(input.name);

    const dirPath = join(projectsRoot, projectId, id);
    const dataPath = join(dataRoot, projectId, 'artifacts', id);

    if (await pathExists(dataPath)) {
      throw new Error(
        `Artifact directory "${input.name}" already exists in project "${projectId}"`
      );
    }

    await ensureDir(dirPath);
    await ensureDir(dataPath);

    const metadata: ArtifactDirMetadata = {
      id,
      name: input.name,
      description: input.description ?? null,
      createdAt: new Date().toISOString(),
    };

    await writeMetadata(dataPath, metadata);

    return new ArtifactDir(dirPath, dataPath);
  }

  /** List all artifact directories in a project. */
  static async list(projectId: string): Promise<ArtifactDirMetadata[]> {
    const { dataRoot } = getConfig();
    const artifactsDataPath = join(dataRoot, projectId, 'artifacts');
    const dirs = await listDirs(artifactsDataPath);
    const artifactDirs: ArtifactDirMetadata[] = [];

    for (const dir of dirs) {
      try {
        const metadata = await readMetadata<ArtifactDirMetadata>(join(artifactsDataPath, dir));
        artifactDirs.push(metadata);
      } catch {
        // Skip directories without valid metadata
      }
    }

    return artifactDirs;
  }

  /** Load an existing artifact directory by ID. */
  static async getById(projectId: string, artifactDirId: string): Promise<ArtifactDir> {
    const { projectsRoot, dataRoot } = getConfig();
    const dirPath = join(projectsRoot, projectId, artifactDirId);
    const dataPath = join(dataRoot, projectId, 'artifacts', artifactDirId);

    if (!(await pathExists(dataPath))) {
      throw new Error(`Artifact directory "${artifactDirId}" not found in project "${projectId}"`);
    }

    return new ArtifactDir(dirPath, dataPath);
  }

  /** Read this artifact directory's metadata */
  async getMetadata(): Promise<ArtifactDirMetadata> {
    return readMetadata<ArtifactDirMetadata>(this.dataPath);
  }

  /** List artifact files in the working directory (the actual content agents produce) */
  async listArtifacts(): Promise<string[]> {
    return listFiles(this.dirPath);
  }

  /** List one directory level in the artifact tree for explorer views */
  async listArtifactEntries(relativePath = ''): Promise<ArtifactExplorerResult> {
    const { absolutePath, relativePath: safePath } = this.resolveArtifactPath(relativePath);

    const directoryStats = await this.statPath(absolutePath);
    if (!directoryStats) {
      throw new Error(`Path "${safePath || '.'}" not found`);
    }
    if (!directoryStats.isDirectory()) {
      throw new Error(`Path "${safePath || '.'}" is not a directory`);
    }

    const entries = await readdir(absolutePath, { withFileTypes: true });
    const mapped = await Promise.all(
      entries.map(async (entry): Promise<ArtifactExplorerEntry | null> => {
        if (!entry.isDirectory() && !entry.isFile()) {
          return null;
        }

        const entryAbsolutePath = join(absolutePath, entry.name);
        const entryStats = await stat(entryAbsolutePath);
        const entryPath = safePath ? `${safePath}/${entry.name}` : entry.name;

        return {
          name: entry.name,
          path: entryPath,
          type: entry.isDirectory() ? 'directory' : 'file',
          size: entry.isFile() ? entryStats.size : null,
          updatedAt: entryStats.mtime.toISOString(),
        };
      })
    );

    const normalizedEntries = mapped
      .filter((entry): entry is ArtifactExplorerEntry => entry !== null)
      .sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

    return {
      path: safePath,
      entries: normalizedEntries,
    };
  }

  /** Read a file from the artifact tree for code/file previews */
  async readArtifactFile(
    relativePath: string,
    maxBytes = DEFAULT_MAX_FILE_BYTES
  ): Promise<ArtifactFileResult> {
    const safeMaxBytes = Number.isFinite(maxBytes)
      ? Math.max(1024, Math.min(Math.floor(maxBytes), MAX_ALLOWED_FILE_BYTES))
      : DEFAULT_MAX_FILE_BYTES;

    const { absolutePath, relativePath: safePath } = this.resolveArtifactPath(relativePath);

    if (!safePath) {
      throw new Error('Path is required');
    }

    const fileStats = await this.statPath(absolutePath);
    if (!fileStats) {
      throw new Error(`File "${safePath}" not found`);
    }
    if (!fileStats.isFile()) {
      throw new Error(`Path "${safePath}" is not a file`);
    }

    const raw = await readFile(absolutePath);
    const isBinary = looksBinary(raw);

    if (isBinary) {
      return {
        path: safePath,
        content: '',
        size: raw.length,
        updatedAt: fileStats.mtime.toISOString(),
        isBinary: true,
        truncated: false,
      };
    }

    const truncated = raw.length > safeMaxBytes;
    const content = (truncated ? raw.subarray(0, safeMaxBytes) : raw).toString('utf-8');

    return {
      path: safePath,
      content,
      size: raw.length,
      updatedAt: fileStats.mtime.toISOString(),
      isBinary: false,
      truncated,
    };
  }

  /** Read a raw file payload from the artifact tree for media/binary previews/downloads */
  async readArtifactRawFile(relativePath: string): Promise<{
    path: string;
    content: Buffer;
    size: number;
    updatedAt: string;
  }> {
    const { absolutePath, relativePath: safePath } = this.resolveArtifactPath(relativePath);

    if (!safePath) {
      throw new Error('Path is required');
    }

    const fileStats = await this.statPath(absolutePath);
    if (!fileStats) {
      throw new Error(`File "${safePath}" not found`);
    }
    if (!fileStats.isFile()) {
      throw new Error(`Path "${safePath}" is not a file`);
    }

    const raw = await readFile(absolutePath);

    return {
      path: safePath,
      content: raw,
      size: raw.length,
      updatedAt: fileStats.mtime.toISOString(),
    };
  }

  /** Delete a file or directory inside the artifact tree */
  async deleteArtifactPath(
    relativePath: string
  ): Promise<{ path: string; type: ArtifactExplorerEntryType }> {
    const { absolutePath, relativePath: safePath } = this.resolveArtifactPath(relativePath);

    if (!safePath) {
      throw new Error('Path is required');
    }

    const targetStats = await this.statPath(absolutePath);
    if (!targetStats) {
      throw new Error(`Path "${safePath}" not found`);
    }

    if (!targetStats.isFile() && !targetStats.isDirectory()) {
      throw new Error(`Path "${safePath}" is not a file or directory`);
    }

    const type: ArtifactExplorerEntryType = targetStats.isDirectory() ? 'directory' : 'file';
    await rm(absolutePath, { recursive: targetStats.isDirectory(), force: false });

    return {
      path: safePath,
      type,
    };
  }

  /** Rename a file or directory inside the artifact tree */
  async renameArtifactPath(
    relativePath: string,
    newName: string
  ): Promise<{ oldPath: string; newPath: string; type: ArtifactExplorerEntryType }> {
    const { absolutePath, relativePath: safePath } = this.resolveArtifactPath(relativePath);

    if (!safePath) {
      throw new Error('Path is required');
    }

    const normalizedName = normalizePathName(newName);
    if (!normalizedName) {
      throw new Error('newName is required');
    }
    if (normalizedName.includes('/') || normalizedName.includes('\\')) {
      throw new Error('newName cannot contain path separators');
    }
    if (normalizedName === '.' || normalizedName === '..') {
      throw new Error('newName is invalid');
    }

    const targetStats = await this.statPath(absolutePath);
    if (!targetStats) {
      throw new Error(`Path "${safePath}" not found`);
    }

    if (!targetStats.isFile() && !targetStats.isDirectory()) {
      throw new Error(`Path "${safePath}" is not a file or directory`);
    }

    const currentName = basename(safePath);
    if (currentName === normalizedName) {
      return {
        oldPath: safePath,
        newPath: safePath,
        type: targetStats.isDirectory() ? 'directory' : 'file',
      };
    }

    const parentPath = dirname(safePath) === '.' ? '' : dirname(safePath).replace(/\\/g, '/');
    const nextRelativePath = parentPath ? `${parentPath}/${normalizedName}` : normalizedName;
    const resolvedNext = this.resolveArtifactPath(nextRelativePath);
    const nextStats = await this.statPath(resolvedNext.absolutePath);

    if (nextStats) {
      throw new Error(`Path "${nextRelativePath}" already exists`);
    }

    await rename(absolutePath, resolvedNext.absolutePath);

    return {
      oldPath: safePath,
      newPath: resolvedNext.relativePath,
      type: targetStats.isDirectory() ? 'directory' : 'file',
    };
  }

  /** Recursively index files in this artifact directory (for mentions/search). */
  async buildFileIndex(options?: {
    query?: string;
    limit?: number;
  }): Promise<ArtifactFileIndexResult> {
    const query = (options?.query ?? '').trim().toLowerCase();
    const limit = Number.isFinite(options?.limit)
      ? Math.max(1, Math.min(Math.floor(options?.limit ?? 1), 100_000))
      : 10_000;

    const files: ArtifactFileIndexResult['files'] = [];
    let truncated = false;

    const stack: string[] = [''];

    while (stack.length > 0) {
      const relativeDir = stack.pop() ?? '';
      const { absolutePath } = this.resolveArtifactPath(relativeDir);
      const entries = await readdir(absolutePath, { withFileTypes: true });

      entries.sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) {
          return a.isDirectory() ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      for (const entry of entries) {
        const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
          stack.push(relativePath);
          continue;
        }

        if (!entry.isFile()) {
          continue;
        }

        if (
          query &&
          !relativePath.toLowerCase().includes(query) &&
          !entry.name.toLowerCase().includes(query)
        ) {
          continue;
        }

        const entryStats = await stat(join(absolutePath, entry.name));
        files.push({
          path: relativePath,
          size: entryStats.size,
          updatedAt: entryStats.mtime.toISOString(),
        });

        if (files.length >= limit) {
          truncated = true;
          break;
        }
      }

      if (truncated) {
        break;
      }
    }

    files.sort((a, b) => a.path.localeCompare(b.path));
    return { files, truncated };
  }

  /** Check if both working directory and metadata directory exist */
  async exists(): Promise<boolean> {
    const [dirExists, dataExists] = await Promise.all([
      pathExists(this.dirPath),
      pathExists(this.dataPath),
    ]);
    return dirExists && dataExists;
  }

  /**
   * Delete this artifact directory.
   * Removes both the working directory and metadata directory.
   */
  async delete(): Promise<void> {
    await Promise.all([removeDir(this.dirPath), removeDir(this.dataPath)]);
  }

  private resolveArtifactPath(relativePath: string): {
    absolutePath: string;
    relativePath: string;
  } {
    const normalizedInput = normalizeRelativePath(relativePath);

    if (!normalizedInput) {
      return { absolutePath: this.dirPath, relativePath: '' };
    }

    if (isAbsolute(normalizedInput)) {
      throw new Error('Invalid path');
    }

    const absolutePath = resolve(this.dirPath, normalizedInput);
    const rel = relative(this.dirPath, absolutePath);

    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error('Invalid path');
    }

    return {
      absolutePath,
      relativePath: rel.replace(/\\/g, '/'),
    };
  }

  private async statPath(targetPath: string): Promise<Awaited<ReturnType<typeof stat>> | null> {
    try {
      return await stat(targetPath);
    } catch {
      return null;
    }
  }
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeRelativePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .trim();
}

function normalizePathName(name: string): string {
  return name.trim();
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
