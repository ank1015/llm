/**
 * Core type definitions for projects and artifact directories.
 * These represent the shapes stored on disk as metadata.json files.
 */

/**
 * Artifact types determine the system prompt and tools available to sessions.
 * - base: General-purpose assistant (default)
 * - research: Optimized for research and exploration
 * - code: Optimized for coding tasks
 */
export type ArtifactType = 'base' | 'research' | 'code';

/** All valid artifact types */
export const ARTIFACT_TYPES: readonly ArtifactType[] = ['base', 'research', 'code'] as const;

/** Metadata stored in each project's metadata.json (lives in dataPath) */
export interface ProjectMetadata {
  /** Unique identifier (used as directory name in both locations) */
  id: string;
  /** Human-readable project name */
  name: string;
  /** Optional description of the project */
  description: string | null;
  /** Absolute path to the actual project directory (~/projects/{id}) */
  projectPath: string;
  /** ISO 8601 timestamp of creation */
  createdAt: string;
}

/** Metadata stored in each artifact directory's metadata.json */
export interface ArtifactDirMetadata {
  /** Unique identifier (used as directory name) */
  id: string;
  /** Human-readable name (e.g. "research", "app", "assets") */
  name: string;
  /** Optional description of what this artifact directory contains */
  description: string | null;
  /** Artifact type that determines session behavior (system prompt, tools) */
  type: ArtifactType;
  /** ISO 8601 timestamp of creation */
  createdAt: string;
}

/** Input for creating a new project */
export interface CreateProjectInput {
  name: string;
  description?: string;
}

/** Input for creating a new artifact directory */
export interface CreateArtifactDirInput {
  name: string;
  description?: string;
  /** Artifact type (defaults to 'base' if not specified) */
  type?: ArtifactType;
}

/** Metadata stored in each session's metadata.json */
export interface SessionMetadata {
  /** Session ID (matches the JSONL session ID) */
  id: string;
  /** Human-readable session name */
  name: string;
  /** API provider (e.g. "anthropic", "openai") */
  api: string;
  /** Model ID (e.g. "claude-sonnet-4-20250514") */
  modelId: string;
  /** ISO 8601 timestamp of creation */
  createdAt: string;
}

/** Input for creating a new session within an artifact directory */
export interface CreateSessionOptions {
  /** Human-readable session name */
  name?: string;
  /** Model ID (e.g. "claude-sonnet-4-20250514") */
  modelId: string;
  /** API provider (e.g. "anthropic", "openai") */
  api: string;
}

/** Input for sending a message in a session */
export interface PromptInput {
  /** The user's message text */
  message: string;
}
