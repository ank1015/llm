/**
 * Core type definitions for projects and artifact directories.
 * These represent the shapes stored on disk as metadata.json files.
 */

import type { Api } from '@ank1015/llm-sdk';

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
}

/** Type of an entry in the artifact file explorer */
export type ArtifactExplorerEntryType = 'file' | 'directory';

/** A single file or directory entry inside an artifact directory */
export interface ArtifactExplorerEntry {
  /** Base name of the entry */
  name: string;
  /** Relative path from artifact root, normalized with "/" separators */
  path: string;
  /** Whether the entry is a file or directory */
  type: ArtifactExplorerEntryType;
  /** File size in bytes. Null for directories. */
  size: number | null;
  /** Last modified timestamp (ISO 8601) */
  updatedAt: string;
}

/** Explorer response for a single directory level */
export interface ArtifactExplorerResult {
  /** Relative path requested ("" means artifact root) */
  path: string;
  /** Immediate children of `path` */
  entries: ArtifactExplorerEntry[];
}

/** File read response for artifact file viewer */
export interface ArtifactFileResult {
  /** Relative file path from artifact root */
  path: string;
  /** UTF-8 decoded file content. Empty for binary files. */
  content: string;
  /** Total file size in bytes */
  size: number;
  /** Last modified timestamp (ISO 8601) */
  updatedAt: string;
  /** Whether this file appears to be binary */
  isBinary: boolean;
  /** Whether returned content was truncated due to maxBytes limit */
  truncated: boolean;
}

/** A file discovered while indexing one artifact directory */
export interface ArtifactFileIndexEntry {
  /** Relative file path from artifact root */
  path: string;
  /** File size in bytes */
  size: number;
  /** Last modified timestamp (ISO 8601) */
  updatedAt: string;
}

/** Result of indexing one artifact directory */
export interface ArtifactFileIndexResult {
  files: ArtifactFileIndexEntry[];
  /** True when `limit` was hit before scanning the full tree */
  truncated: boolean;
}

/** Project-level file index entry (for mentions/search across artifacts) */
export interface ProjectFileIndexEntry {
  artifactId: string;
  artifactName: string;
  /** Relative path inside the artifact directory */
  path: string;
  /** Convenience path in form: "{artifactId}/{path}" */
  artifactPath: string;
  size: number;
  updatedAt: string;
}

/** Response shape for project-wide file index/search */
export interface ProjectFileIndexResult {
  projectId: string;
  query: string;
  files: ProjectFileIndexEntry[];
  /** True when `limit` was reached and more matches may exist */
  truncated: boolean;
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
  /** Currently visible branch for this session */
  activeBranch: string;
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
export type ReasoningLevel = 'low' | 'medium' | 'high' | 'xhigh';

export interface PromptInput {
  /** The user's message text */
  message: string;
  /** Skill names to activate for this prompt (resolved from globalSkills) */
  skills?: string[];
  /** Optional visible leaf node to continue from instead of persisted active branch */
  leafNodeId?: string;
  /** Optional per-turn API override */
  api?: Api;
  /** Optional per-turn model override */
  modelId?: string;
  /** Optional per-turn reasoning level */
  reasoningLevel?: ReasoningLevel;
  /** Backward-compatible alias for per-turn reasoning level */
  reasoning?: ReasoningLevel;
}
