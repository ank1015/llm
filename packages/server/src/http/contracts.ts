import type {
  ArtifactDirMetadata,
  BundledSkillEntry,
  InstalledSkillEntry,
  ProjectMetadata,
  SessionMetadata,
} from '../core/index.js';
import type {
  ArtifactDirDto,
  ArtifactDirOverviewDto,
  BundledSkillDto,
  DeleteArtifactSkillResponse,
  InstalledSkillDto,
  LiveRunSummaryDto,
  ProjectDto,
  SessionMetadataDto,
  SessionSummaryDto,
  SessionTreeResponse,
} from '@ank1015/llm-app-contracts';
import type { SessionSummary } from '@ank1015/llm-sdk';

export function toProjectDto(project: ProjectMetadata): ProjectDto {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    projectImg: project.projectImg,
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
    api: session.api,
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

function toSkillDto<T extends BundledSkillDto | InstalledSkillDto>(
  skill: BundledSkillEntry | InstalledSkillEntry
): T {
  return {
    name: skill.name,
    description: skill.description,
    ...(skill.helperProject ? { helperProject: skill.helperProject } : {}),
  } as T;
}

export function toBundledSkillDto(skill: BundledSkillEntry): BundledSkillDto {
  return toSkillDto<BundledSkillDto>(skill);
}

export function toInstalledSkillDto(skill: InstalledSkillEntry): InstalledSkillDto {
  return toSkillDto<InstalledSkillDto>(skill);
}

export function toDeleteArtifactSkillResponse(skillName: string): DeleteArtifactSkillResponse {
  return {
    ok: true,
    skillName,
    deleted: true,
  };
}

export function toLiveRunSummaryDto(summary: LiveRunSummaryDto): LiveRunSummaryDto {
  return summary;
}

export function toSessionTreeResponse(
  tree: {
    nodes: SessionTreeResponse['nodes'];
    persistedLeafNodeId: string | null;
    activeBranch: string;
  },
  liveRun?: LiveRunSummaryDto | null
): SessionTreeResponse {
  return {
    nodes: tree.nodes,
    persistedLeafNodeId: tree.persistedLeafNodeId,
    activeBranch: tree.activeBranch,
    ...(liveRun ? { liveRun: toLiveRunSummaryDto(liveRun) } : {}),
  };
}
