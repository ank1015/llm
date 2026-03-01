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

    const metadata: ProjectMetadata = {
      id,
      name: input.name,
      description: input.description ?? null,
      projectPath,
      createdAt: new Date().toISOString(),
    };

    await writeMetadata(dataPath, metadata);

    return new Project(projectPath, dataPath);
  }

  /** List all projects by scanning the data root for valid project directories. */
  static async list(): Promise<ProjectMetadata[]> {
    const { dataRoot } = getConfig();
    const dirs = await listDirs(dataRoot);
    const projects: ProjectMetadata[] = [];

    for (const dir of dirs) {
      try {
        const metadata = await readMetadata<ProjectMetadata>(join(dataRoot, dir));
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

    const metadata = await readMetadata<ProjectMetadata>(dataPath);
    return new Project(metadata.projectPath, dataPath);
  }

  /** Read this project's metadata */
  async getMetadata(): Promise<ProjectMetadata> {
    return readMetadata<ProjectMetadata>(this.dataPath);
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
