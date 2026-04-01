/** Metadata stored in each project's metadata.json (lives in dataPath) */
export interface ProjectMetadata {
  /** Unique identifier (used as directory name in both locations) */
  id: string;
  /** Human-readable project name */
  name: string;
  /** Optional description of the project */
  description: string | null;
  /** Optional project image URL */
  projectImg: string | null;
  /** Whether the project is archived */
  archived: boolean;
  /** Absolute path to the actual project directory (~/projects/{id}) */
  projectPath: string;
  /** ISO 8601 timestamp of creation */
  createdAt: string;
}

/** Input for creating a new project */
export interface CreateProjectInput {
  name: string;
  description?: string;
  projectImg?: string;
}

export interface ProjectFileIndexEntry {
  artifactId: string;
  artifactName: string;
  path: string;
  type: 'file' | 'directory';
  artifactPath: string;
  size: number;
  updatedAt: string;
}

export interface ProjectFileIndexResult {
  projectId: string;
  query: string;
  files: ProjectFileIndexEntry[];
  truncated: boolean;
}
