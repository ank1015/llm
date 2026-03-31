import type {
  ArtifactDirMetadata,
  ArtifactCheckpoint,
  ArtifactCheckpointDiffFile,
  ProjectMetadata,
  SessionMessageNode,
  SessionMetadata,
  SessionSummary,
  TerminalMetadata,
  TerminalSummary,
} from '../types/index.js';
import type {
  ArtifactDirDto,
  ArtifactCheckpointDto,
  ArtifactCheckpointDiffFileDto,
  ArtifactCheckpointDiffResponse,
  ArtifactCheckpointListResponse,
  ArtifactDirOverviewDto,
  LiveRunSummaryDto,
  ProjectDto,
  SessionMetadataDto,
  SessionSummaryDto,
  SessionTreeResponse,
  TerminalMetadataDto,
  TerminalSummaryDto,
} from '../contracts/index.js';
import type { LiveRunSummary } from '../core/session/run-registry.js';

export function toProjectDto(project: ProjectMetadata): ProjectDto {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    projectImg: project.projectImg,
    archived: project.archived,
    createdAt: project.createdAt,
  };
}

export function toArtifactDirDto(artifactDir: ArtifactDirMetadata): ArtifactDirDto {
  return {
    id: artifactDir.id,
    name: artifactDir.name,
    description: artifactDir.description,
    createdAt: artifactDir.createdAt,
  };
}

export function toArtifactCheckpointDto(checkpoint: ArtifactCheckpoint): ArtifactCheckpointDto {
  return checkpoint;
}

export function toArtifactCheckpointListResponse(
  result: {
    hasRepository: boolean;
    dirty: boolean;
    headCommitHash: string | null;
    checkpoints: ArtifactCheckpoint[];
  }
): ArtifactCheckpointListResponse {
  return {
    hasRepository: result.hasRepository,
    dirty: result.dirty,
    headCommitHash: result.headCommitHash,
    checkpoints: result.checkpoints.map(toArtifactCheckpointDto),
  };
}

export function toArtifactCheckpointDiffFileDto(
  file: ArtifactCheckpointDiffFile
): ArtifactCheckpointDiffFileDto {
  return file;
}

export function toArtifactCheckpointDiffResponse(
  result: {
    hasRepository: boolean;
    headCommitHash: string | null;
    dirty: boolean;
    files: ArtifactCheckpointDiffFile[];
  }
): ArtifactCheckpointDiffResponse {
  return {
    hasRepository: result.hasRepository,
    headCommitHash: result.headCommitHash,
    dirty: result.dirty,
    files: result.files.map(toArtifactCheckpointDiffFileDto),
  };
}

export function toSessionSummaryDto(session: SessionSummary): SessionSummaryDto {
  return {
    sessionId: session.sessionId,
    sessionName: session.sessionName,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    nodeCount: session.nodeCount,
  };
}

export function toSessionMetadataDto(session: SessionMetadata): SessionMetadataDto {
  return {
    id: session.id,
    name: session.name,
    modelId: session.modelId,
    createdAt: session.createdAt,
    activeBranch: session.activeBranch,
  };
}

export function toArtifactDirOverviewDto(
  artifactDir: ArtifactDirMetadata,
  sessions: readonly SessionSummary[]
): ArtifactDirOverviewDto {
  return {
    ...toArtifactDirDto(artifactDir),
    sessions: sessions.map(toSessionSummaryDto),
  };
}

export function toLiveRunSummaryDto(summary: LiveRunSummary): LiveRunSummaryDto {
  return summary;
}

export function toTerminalSummaryDto(summary: TerminalSummary): TerminalSummaryDto {
  return summary;
}

export function toTerminalMetadataDto(metadata: TerminalMetadata): TerminalMetadataDto {
  return metadata;
}

export function toSessionTreeResponse(
  tree: {
    nodes: SessionMessageNode[];
    persistedLeafNodeId: string | null;
    activeBranch: string;
  },
  liveRun?: LiveRunSummary | null
): SessionTreeResponse {
  return {
    nodes: tree.nodes,
    persistedLeafNodeId: tree.persistedLeafNodeId,
    activeBranch: tree.activeBranch,
    ...(liveRun ? { liveRun: toLiveRunSummaryDto(liveRun) } : {}),
  };
}
