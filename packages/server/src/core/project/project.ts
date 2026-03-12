import { join } from 'node:path';

import { getConfig } from '../config.js';
import {
  ensureDir,
  pathExists,
  removeDir,
  readMetadata,
  writeMetadata,
  listDirs,
} from '../storage/fs.js';

import type { ProjectMetadata, CreateProjectInput } from '../types.js';

type StoredProjectMetadata = Omit<ProjectMetadata, 'description' | 'projectImg'> & {
  description?: string | null;
  projectImg?: string | null;
};

/**
 * Manages a single project.
 *
 * A project has two directories:
 * - projectPath: the actual working directory where agents operate (~/projects/{id})
 * - dataPath: system metadata, artifact dir metadata, session files (~/.llm/projects/{id})
 *
 * Agents work in projectPath. They never see dataPath.
 */
export class Project {
  constructor(
    /** Absolute path to the project working directory */
    readonly projectPath: string,
    /** Absolute path to the project system/metadata directory */
    readonly dataPath: string
  ) {}

  /**
   * Create a new project.
   * Creates both the working directory and the metadata directory.
   */
  static async create(input: CreateProjectInput): Promise<Project> {
    const { projectsRoot, dataRoot } = getConfig();
    const id = slugify(input.name);

    const projectPath = join(projectsRoot, id);
    const dataPath = join(dataRoot, id);

    if (await pathExists(dataPath)) {
      throw new Error(`Project "${input.name}" already exists`);
    }

    await ensureDir(projectPath);
    await ensureDir(dataPath);

    try {
      const metadata: ProjectMetadata = {
        id,
        name: input.name,
        description: input.description ?? null,
        projectImg: input.projectImg ?? null,
        projectPath,
        createdAt: new Date().toISOString(),
      };

      await writeMetadata(dataPath, metadata);

      return new Project(projectPath, dataPath);
    } catch (error) {
      await Promise.allSettled([removeDir(projectPath), removeDir(dataPath)]);
      throw error;
    }
  }

  /** List all projects by scanning the data root for valid project directories. */
  static async list(): Promise<ProjectMetadata[]> {
    const { dataRoot } = getConfig();
    const dirs = await listDirs(dataRoot);
    const projects: ProjectMetadata[] = [];

    for (const dir of dirs) {
      try {
        const metadata = await readProjectMetadata(join(dataRoot, dir));
        projects.push(metadata);
      } catch {
        // Skip directories without valid metadata
      }
    }

    return projects;
  }

  /** Load an existing project by ID. */
  static async getById(projectId: string): Promise<Project> {
    const { dataRoot } = getConfig();
    const dataPath = join(dataRoot, projectId);

    if (!(await pathExists(dataPath))) {
      throw new Error(`Project "${projectId}" not found`);
    }

    const metadata = await readProjectMetadata(dataPath);
    return new Project(metadata.projectPath, dataPath);
  }

  /** Load an existing project by its human-readable name. */
  static async getByName(projectName: string): Promise<Project> {
    const projectId = slugify(projectName);

    if (!projectId) {
      throw new Error(`Project "${projectName}" not found`);
    }

    return Project.getById(projectId);
  }

  /** Read this project's metadata */
  async getMetadata(): Promise<ProjectMetadata> {
    return readProjectMetadata(this.dataPath);
  }

  /** Update this project's image URL. */
  async updateProjectImg(projectImg: string | null): Promise<ProjectMetadata> {
    const metadata = await this.getMetadata();
    const nextMetadata: ProjectMetadata = {
      ...metadata,
      projectImg: projectImg ?? null,
    };

    await writeMetadata(this.dataPath, nextMetadata);
    return nextMetadata;
  }

  /** Update this project's display name without changing its stable id or paths. */
  async rename(name: string): Promise<ProjectMetadata> {
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      throw new Error('Project name cannot be empty');
    }

    const metadata = await this.getMetadata();
    if (metadata.name === trimmedName) {
      return metadata;
    }

    const nextMetadata: ProjectMetadata = {
      ...metadata,
      name: trimmedName,
    };

    await writeMetadata(this.dataPath, nextMetadata);
    return nextMetadata;
  }

  /** Check if both project directory and metadata directory exist */
  async exists(): Promise<boolean> {
    const [projectExists, dataExists] = await Promise.all([
      pathExists(this.projectPath),
      pathExists(this.dataPath),
    ]);
    return projectExists && dataExists;
  }

  /**
   * Delete this project.
   * Removes both the working directory and metadata directory.
   */
  async delete(): Promise<void> {
    await Promise.all([removeDir(this.projectPath), removeDir(this.dataPath)]);
  }
}

/**
 * Convert a project name to a filesystem-safe slug.
 * Lowercase, replace non-alphanumeric chars with hyphens, trim hyphens.
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function readProjectMetadata(dirPath: string): Promise<ProjectMetadata> {
  const metadata = await readMetadata<StoredProjectMetadata>(dirPath);
  return {
    ...metadata,
    description: metadata.description ?? null,
    projectImg: metadata.projectImg ?? null,
  };
}
