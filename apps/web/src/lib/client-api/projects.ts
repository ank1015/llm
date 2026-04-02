import { apiRequestJson, SERVER_BASE } from './http';

import type {
  ArtifactCheckpointDiffResponse,
  ArtifactCheckpointListResponse,
  ArtifactCheckpointRollbackResponse,
  ArtifactDirDeleteResponse,
  ArtifactDirDto,
  ArtifactExplorerResult,
  ArtifactFileDto,
  ArtifactFilesListResponse,
  ArtifactInstalledSkillDto,
  CreateArtifactDirRequest,
  CreateProjectRequest,
  DeleteArtifactSkillResponse,
  DeleteArtifactPathResponse,
  InstallArtifactSkillRequest,
  ProjectDeleteResponse,
  ProjectDto,
  ProjectFileIndexResult,
  ProjectOverviewDto,
  RegisteredSkillDto,
  RenameArtifactDirRequest,
  RenameArtifactPathRequest,
  RenameArtifactPathResponse,
  RenameProjectRequest,
  UpdateProjectImageRequest,
  UpdateArtifactFileRequest,
} from '@ank1015/llm-server/contracts';

const PROJECTS_BASE = `${SERVER_BASE}/api/projects`;

export type ArtifactContext = {
  projectId: string;
  artifactId: string;
};

export type CreateProjectInput = Omit<CreateProjectRequest, 'name'> & {
  name: string;
};

export type RenameProjectInput = Omit<RenameProjectRequest, 'name'> & {
  name: string;
};

export type UpdateProjectImageInput = {
  projectImg: string;
} & (
  | {
      projectId: string;
      projectName?: string;
    }
  | {
      projectId?: string;
      projectName: string;
    }
);

export type CreateArtifactDirInput = Omit<CreateArtifactDirRequest, 'name'> & {
  name: string;
};

export type RenameArtifactDirInput = Omit<RenameArtifactDirRequest, 'name'> & {
  name: string;
};

export type RenameArtifactPathInput = Omit<RenameArtifactPathRequest, 'path' | 'newName'> & {
  path: string;
  newName: string;
};

export type ProjectFileIndexInput = {
  query?: string;
  limit?: number;
};

type ArtifactFileInput = {
  path: string;
  maxBytes?: number;
};

export type UpdateArtifactFileInput = {
  path: string;
  content: string;
};

export type InstallArtifactSkillInput = Omit<InstallArtifactSkillRequest, 'skillName'> & {
  skillName: string;
};

function buildArtifactBase(ctx: ArtifactContext): string {
  return `${PROJECTS_BASE}/${encodeURIComponent(ctx.projectId)}/artifacts/${encodeURIComponent(ctx.artifactId)}`;
}

export function getArtifactFileBaseUrl(ctx: ArtifactContext): string {
  return `${buildArtifactBase(ctx)}/file/raw`;
}

export async function listProjects(): Promise<ProjectDto[]> {
  return apiRequestJson<ProjectDto[]>(PROJECTS_BASE, {
    method: 'GET',
  });
}

export async function listRegisteredSkills(): Promise<RegisteredSkillDto[]> {
  return apiRequestJson<RegisteredSkillDto[]>(`${SERVER_BASE}/api/skills`, {
    method: 'GET',
  });
}

export async function createProject(input: CreateProjectInput): Promise<ProjectDto> {
  return apiRequestJson<ProjectDto>(PROJECTS_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function getProject(projectId: string): Promise<ProjectDto> {
  return apiRequestJson<ProjectDto>(`${PROJECTS_BASE}/${encodeURIComponent(projectId)}`, {
    method: 'GET',
  });
}

export async function updateProjectImage(input: UpdateProjectImageInput): Promise<ProjectDto> {
  return apiRequestJson<ProjectDto>(`${PROJECTS_BASE}/project-img`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input satisfies UpdateProjectImageRequest),
  });
}

export async function renameProject(
  projectId: string,
  input: RenameProjectInput
): Promise<ProjectDto> {
  return apiRequestJson<ProjectDto>(`${PROJECTS_BASE}/${encodeURIComponent(projectId)}/name`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function toggleProjectArchive(projectId: string): Promise<ProjectDto> {
  return apiRequestJson<ProjectDto>(
    `${PROJECTS_BASE}/${encodeURIComponent(projectId)}/archive-toggle`,
    {
      method: 'PATCH',
    }
  );
}

export async function deleteProject(projectId: string): Promise<ProjectDeleteResponse> {
  return apiRequestJson<ProjectDeleteResponse>(
    `${PROJECTS_BASE}/${encodeURIComponent(projectId)}`,
    {
      method: 'DELETE',
    }
  );
}

export async function getProjectOverview(projectId: string): Promise<ProjectOverviewDto> {
  return apiRequestJson<ProjectOverviewDto>(
    `${PROJECTS_BASE}/${encodeURIComponent(projectId)}/overview`,
    { method: 'GET' }
  );
}

export async function getProjectFileIndex(
  projectId: string,
  input?: ProjectFileIndexInput
): Promise<ProjectFileIndexResult> {
  const params = new URLSearchParams();
  if (input?.query?.trim()) {
    params.set('query', input.query.trim());
  }
  if (typeof input?.limit === 'number' && Number.isFinite(input.limit)) {
    params.set('limit', `${Math.floor(input.limit)}`);
  }

  const query = params.toString();
  const url = `${PROJECTS_BASE}/${encodeURIComponent(projectId)}/file-index${query ? `?${query}` : ''}`;
  return apiRequestJson<ProjectFileIndexResult>(url, { method: 'GET' });
}

export async function listArtifactDirs(projectId: string): Promise<ArtifactDirDto[]> {
  return apiRequestJson<ArtifactDirDto[]>(
    `${PROJECTS_BASE}/${encodeURIComponent(projectId)}/artifacts`,
    {
      method: 'GET',
    }
  );
}

export async function createArtifactDir(
  projectId: string,
  input: CreateArtifactDirInput
): Promise<ArtifactDirDto> {
  return apiRequestJson<ArtifactDirDto>(
    `${PROJECTS_BASE}/${encodeURIComponent(projectId)}/artifacts`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  );
}

export async function getArtifactDir(ctx: ArtifactContext): Promise<ArtifactDirDto> {
  return apiRequestJson<ArtifactDirDto>(buildArtifactBase(ctx), {
    method: 'GET',
  });
}

export async function renameArtifactDir(
  projectId: string,
  artifactId: string,
  input: RenameArtifactDirInput
): Promise<ArtifactDirDto> {
  return apiRequestJson<ArtifactDirDto>(
    `${PROJECTS_BASE}/${encodeURIComponent(projectId)}/artifacts/${encodeURIComponent(artifactId)}/name`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  );
}

export async function deleteArtifactDir(
  projectId: string,
  artifactId: string
): Promise<ArtifactDirDeleteResponse> {
  return apiRequestJson<ArtifactDirDeleteResponse>(
    `${PROJECTS_BASE}/${encodeURIComponent(projectId)}/artifacts/${encodeURIComponent(artifactId)}`,
    {
      method: 'DELETE',
    }
  );
}

export async function getArtifactFiles(ctx: ArtifactContext): Promise<ArtifactFilesListResponse> {
  return apiRequestJson<ArtifactFilesListResponse>(`${buildArtifactBase(ctx)}/files`, {
    method: 'GET',
  });
}

export async function listInstalledArtifactSkills(
  ctx: ArtifactContext
): Promise<ArtifactInstalledSkillDto[]> {
  return apiRequestJson<ArtifactInstalledSkillDto[]>(`${buildArtifactBase(ctx)}/skills`, {
    method: 'GET',
  });
}

export async function installArtifactSkill(
  ctx: ArtifactContext,
  input: InstallArtifactSkillInput
): Promise<ArtifactInstalledSkillDto> {
  return apiRequestJson<ArtifactInstalledSkillDto>(`${buildArtifactBase(ctx)}/skills`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input satisfies InstallArtifactSkillRequest),
  });
}

export async function reloadArtifactSkill(
  ctx: ArtifactContext,
  skillName: string
): Promise<ArtifactInstalledSkillDto> {
  return apiRequestJson<ArtifactInstalledSkillDto>(
    `${buildArtifactBase(ctx)}/skills/${encodeURIComponent(skillName)}/reload`,
    {
      method: 'POST',
    }
  );
}

export async function deleteArtifactSkill(
  ctx: ArtifactContext,
  skillName: string
): Promise<DeleteArtifactSkillResponse> {
  return apiRequestJson<DeleteArtifactSkillResponse>(
    `${buildArtifactBase(ctx)}/skills/${encodeURIComponent(skillName)}`,
    {
      method: 'DELETE',
    }
  );
}

export async function getArtifactCheckpoints(
  ctx: ArtifactContext
): Promise<ArtifactCheckpointListResponse> {
  return apiRequestJson<ArtifactCheckpointListResponse>(`${buildArtifactBase(ctx)}/checkpoints`, {
    method: 'GET',
  });
}

export async function createArtifactCheckpoint(
  ctx: ArtifactContext
): Promise<ArtifactCheckpointListResponse['checkpoints'][number]> {
  return apiRequestJson<ArtifactCheckpointListResponse['checkpoints'][number]>(
    `${buildArtifactBase(ctx)}/checkpoints`,
    {
      method: 'POST',
    }
  );
}

export async function getArtifactCheckpointDiff(
  ctx: ArtifactContext
): Promise<ArtifactCheckpointDiffResponse> {
  return apiRequestJson<ArtifactCheckpointDiffResponse>(
    `${buildArtifactBase(ctx)}/checkpoints/diff`,
    {
      method: 'GET',
    }
  );
}

export async function rollbackArtifactCheckpoint(
  ctx: ArtifactContext
): Promise<ArtifactCheckpointRollbackResponse> {
  return apiRequestJson<ArtifactCheckpointRollbackResponse>(
    `${buildArtifactBase(ctx)}/checkpoints/rollback`,
    {
      method: 'POST',
    }
  );
}

export async function getArtifactExplorer(
  ctx: ArtifactContext,
  path = ''
): Promise<ArtifactExplorerResult> {
  const params = new URLSearchParams();
  if (path.trim().length > 0) {
    params.set('path', path);
  }

  const query = params.toString();
  const url = `${buildArtifactBase(ctx)}/explorer${query ? `?${query}` : ''}`;
  return apiRequestJson<ArtifactExplorerResult>(url, { method: 'GET' });
}

export async function getArtifactFile(
  ctx: ArtifactContext,
  input: ArtifactFileInput
): Promise<ArtifactFileDto> {
  const params = new URLSearchParams({ path: input.path });
  if (typeof input.maxBytes === 'number' && Number.isFinite(input.maxBytes)) {
    params.set('maxBytes', `${Math.floor(input.maxBytes)}`);
  }

  return apiRequestJson<ArtifactFileDto>(`${buildArtifactBase(ctx)}/file?${params.toString()}`, {
    method: 'GET',
  });
}

export async function updateArtifactFile(
  ctx: ArtifactContext,
  input: UpdateArtifactFileInput
): Promise<ArtifactFileDto> {
  return apiRequestJson<ArtifactFileDto>(`${buildArtifactBase(ctx)}/file`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input satisfies UpdateArtifactFileRequest),
  });
}

export function getArtifactRawFileUrl(
  ctx: ArtifactContext,
  input: Pick<ArtifactFileInput, 'path'>
): string {
  const params = new URLSearchParams({ path: input.path });
  return `${getArtifactFileBaseUrl(ctx)}?${params.toString()}`;
}

export async function renameArtifactPath(
  ctx: ArtifactContext,
  input: RenameArtifactPathInput
): Promise<RenameArtifactPathResponse> {
  return apiRequestJson<RenameArtifactPathResponse>(`${buildArtifactBase(ctx)}/path/rename`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: input.path,
      newName: input.newName,
    }),
  });
}

export async function deleteArtifactPath(
  ctx: ArtifactContext,
  input: { path: string }
): Promise<DeleteArtifactPathResponse> {
  const params = new URLSearchParams({ path: input.path });
  return apiRequestJson<DeleteArtifactPathResponse>(
    `${buildArtifactBase(ctx)}/path?${params.toString()}`,
    { method: 'DELETE' }
  );
}
