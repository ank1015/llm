import { join } from 'node:path';

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

import type { ArtifactDirMetadata, CreateArtifactDirInput } from '../types.js';

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
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
