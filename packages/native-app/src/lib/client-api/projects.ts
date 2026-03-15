import { apiRequestJson, SERVER_BASE } from './http';

import type {
  ArtifactDirDeleteResponse,
  ArtifactDirDto,
  ArtifactDirOverviewDto,
  ArtifactExplorerResult,
  ArtifactFileDto,
  BundledSkillDto,
  CreateArtifactDirRequest,
  CreateProjectRequest,
  DeleteArtifactPathResponse,
  InstallArtifactSkillRequest,
  InstalledSkillDto,
  ProjectDeleteResponse,
  ProjectDto,
  ProjectFileIndexResult,
  ProjectOverviewDto,
  RenameArtifactDirRequest,
  RenameArtifactPathRequest,
  RenameArtifactPathResponse,
  RenameProjectRequest,
} from '@ank1015/llm-app-contracts';

const PROJECTS_BASE = `${SERVER_BASE}/api/projects`;

export type ArtifactContext = {
  projectId: string;
  artifactId: string;
};

type CreateProjectInput = Omit<CreateProjectRequest, 'name'> & {
  name: string;
};

type RenameProjectInput = Omit<RenameProjectRequest, 'name'> & {
  name: string;
};

type CreateArtifactDirInput = Omit<CreateArtifactDirRequest, 'name'> & {
  name: string;
};

type RenameArtifactDirInput = Omit<RenameArtifactDirRequest, 'name'> & {
  name: string;
};

type InstallArtifactSkillInput = Omit<InstallArtifactSkillRequest, 'skillName'> & {
  skillName: string;
};

type RenameArtifactPathInput = Omit<RenameArtifactPathRequest, 'path' | 'newName'> & {
  path: string;
  newName: string;
};

export async function listProjects(): Promise<ProjectDto[]> {
  return apiRequestJson<ProjectDto[]>(PROJECTS_BASE, {
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

export async function deleteProject(projectId: string): Promise<ProjectDeleteResponse> {
  return apiRequestJson<ProjectDeleteResponse>(
    `${PROJECTS_BASE}/${encodeURIComponent(projectId)}`,
    {
      method: 'DELETE',
    }
  );
}

export async function listBundledSkills(): Promise<BundledSkillDto[]> {
  return apiRequestJson<BundledSkillDto[]>(`${SERVER_BASE}/api/skills`, {
    method: 'GET',
  });
}

export async function getProjectOverview(projectId: string): Promise<ProjectOverviewDto> {
  return apiRequestJson<ProjectOverviewDto>(
    `${PROJECTS_BASE}/${encodeURIComponent(projectId)}/overview`,
    { method: 'GET' }
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

export async function renameArtifactDir(
  projectId: string,
  artifactDirId: string,
  input: RenameArtifactDirInput
): Promise<ArtifactDirDto> {
  return apiRequestJson<ArtifactDirDto>(
    `${PROJECTS_BASE}/${encodeURIComponent(projectId)}/artifacts/${encodeURIComponent(artifactDirId)}/name`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  );
}

export async function deleteArtifactDir(
  projectId: string,
  artifactDirId: string
): Promise<ArtifactDirDeleteResponse> {
  return apiRequestJson<ArtifactDirDeleteResponse>(
    `${PROJECTS_BASE}/${encodeURIComponent(projectId)}/artifacts/${encodeURIComponent(artifactDirId)}`,
    {
      method: 'DELETE',
    }
  );
}

function buildArtifactBase(ctx: ArtifactContext): string {
  return `${PROJECTS_BASE}/${encodeURIComponent(ctx.projectId)}/artifacts/${encodeURIComponent(ctx.artifactId)}`;
}

export function getArtifactFileBaseUrl(ctx: ArtifactContext): string {
  return `${buildArtifactBase(ctx)}/file/raw`;
}

export async function listInstalledArtifactSkills(
  ctx: ArtifactContext
): Promise<InstalledSkillDto[]> {
  return apiRequestJson<InstalledSkillDto[]>(`${buildArtifactBase(ctx)}/skills`, {
    method: 'GET',
  });
}

export async function installArtifactSkill(
  ctx: ArtifactContext,
  input: InstallArtifactSkillInput
): Promise<InstalledSkillDto> {
  return apiRequestJson<InstalledSkillDto>(`${buildArtifactBase(ctx)}/skills`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      skillName: input.skillName,
    }),
  });
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
  input: { path: string; maxBytes?: number }
): Promise<ArtifactFileDto> {
  const params = new URLSearchParams({ path: input.path });
  if (typeof input.maxBytes === 'number' && Number.isFinite(input.maxBytes)) {
    params.set('maxBytes', `${Math.floor(input.maxBytes)}`);
  }

  return apiRequestJson<ArtifactFileDto>(`${buildArtifactBase(ctx)}/file?${params.toString()}`, {
    method: 'GET',
  });
}

export function getArtifactRawFileUrl(ctx: ArtifactContext, input: { path: string }): string {
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

export async function getProjectFileIndex(
  projectId: string,
  input?: { query?: string; limit?: number }
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

export type {
  ArtifactDirDto,
  ArtifactDirOverviewDto,
  ArtifactExplorerResult,
  ArtifactFileDto,
  BundledSkillDto,
  InstalledSkillDto,
  ProjectDto,
  ProjectFileIndexResult,
  ProjectOverviewDto,
  RenameArtifactPathResponse,
  DeleteArtifactPathResponse,
};
