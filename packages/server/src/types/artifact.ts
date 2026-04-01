
/** Type of an entry in the artifact file explorer */
export type ArtifactExplorerEntryType = 'file' | 'directory';

/** Metadata stored in each artifact directory's metadata.json */
export interface ArtifactDirMetadata {
  /** Unique identifier slug (used as the directory name and route id) */
  id: string;
  /** Human-readable name (e.g. "research", "app", "assets") */
  name: string;
  /** Optional description of what this artifact directory contains */
  description: string | null;
  /** ISO 8601 timestamp of creation */
  createdAt: string;
}

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

/** A path discovered while indexing one artifact directory */
export interface ArtifactFileIndexEntry {
  /** Relative path from artifact root. Empty string represents the artifact root itself. */
  path: string;
  /** Whether this indexed path is a file or directory */
  type: ArtifactExplorerEntryType;
  /** Size in bytes. Directories report 0. */
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

/** Input for creating a new artifact directory */
export interface CreateArtifactDirInput {
  name: string;
  description?: string;
}

export const CHECKPOINT_SUMMARY_STATUSES = [
  'pending',
  'ready',
  'failed',
  'unavailable',
] as const;

export type CheckpointSummaryStatus = (typeof CHECKPOINT_SUMMARY_STATUSES)[number];

export interface ArtifactCheckpointMetadata {
  commitHash: string;
  createdAt: string;
  summaryStatus: Extract<CheckpointSummaryStatus, 'pending' | 'ready' | 'failed'>;
  title: string | null;
  description: string | null;
  summaryError?: string;
  summaryStartedAt?: string;
  summaryFinishedAt?: string;
}

export interface ArtifactCheckpoint {
  commitHash: string;
  shortHash: string;
  createdAt: string;
  summaryStatus: CheckpointSummaryStatus;
  title: string | null;
  description: string | null;
  isHead: boolean;
}

export interface ArtifactCheckpointListResult {
  hasRepository: boolean;
  dirty: boolean;
  headCommitHash: string | null;
  checkpoints: ArtifactCheckpoint[];
}

export interface ArtifactCheckpointRollbackResult {
  ok: true;
  reverted: boolean;
  headCommitHash: string;
}

export type ArtifactCheckpointDiffChangeType = 'added' | 'modified' | 'deleted' | 'renamed';

export interface ArtifactCheckpointDiffFile {
  path: string;
  previousPath: string | null;
  changeType: ArtifactCheckpointDiffChangeType;
  isBinary: boolean;
  beforeText: string | null;
  afterText: string | null;
  textTruncated: boolean;
}

export interface ArtifactCheckpointDiffResult {
  hasRepository: boolean;
  headCommitHash: string | null;
  dirty: boolean;
  files: ArtifactCheckpointDiffFile[];
}
