import { apiRequestJson, SERVER_BASE } from './http';

const PROJECTS_BASE = `${SERVER_BASE}/api/projects`;

export type ProjectMetadata = {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string | null;
};

export type ArtifactDirMetadata = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
};

export type OverviewSession = {
  sessionId: string;
  sessionName: string;
  createdAt: string;
  updatedAt: string | null;
  nodeCount: number;
};

export type ArtifactDirWithSessions = ArtifactDirMetadata & {
  sessions: OverviewSession[];
};

export type ProjectOverview = {
  project: ProjectMetadata;
  artifactDirs: ArtifactDirWithSessions[];
};

export type ArtifactContext = {
  projectId: string;
  artifactId: string;
};

export type ArtifactExplorerEntryType = 'file' | 'directory';

export type ArtifactExplorerEntry = {
  name: string;
  path: string;
  type: ArtifactExplorerEntryType;
  size: number | null;
  updatedAt: string;
};

export type ArtifactExplorerResult = {
  path: string;
  entries: ArtifactExplorerEntry[];
};

export type ArtifactFileResult = {
  path: string;
  content: string;
  size: number;
  updatedAt: string;
  isBinary: boolean;
  truncated: boolean;
};

export type ArtifactPathRenameResult = {
  ok: true;
  oldPath: string;
  newPath: string;
  type: ArtifactExplorerEntryType;
};

export type ArtifactPathDeleteResult = {
  ok: true;
  deleted: true;
  path: string;
  type: ArtifactExplorerEntryType;
};

export type ProjectFileIndexEntry = {
  artifactId: string;
  artifactName: string;
  path: string;
  artifactPath: string;
  size: number;
  updatedAt: string;
};

export type ProjectFileIndexResult = {
  projectId: string;
  query: string;
  files: ProjectFileIndexEntry[];
  truncated: boolean;
};

export type BundledSkillEntry = {
  name: string;
  description: string;
  path: string;
  directory: string;
};

export type InstalledArtifactSkill = {
  name: string;
  description: string;
  path: string;
  artifactDir: string;
  maxDir: string;
  skillsDir: string;
  tempDir: string;
  directory: string;
};

export type InstallArtifactSkillResult = InstalledArtifactSkill & {
  sourceDirectory: string;
  sourcePath: string;
};

export async function listProjects(): Promise<ProjectMetadata[]> {
  return apiRequestJson<ProjectMetadata[]>(PROJECTS_BASE, {
    method: 'GET',
  });
}

export async function createProject(input: {
  name: string;
  description?: string;
}): Promise<ProjectMetadata> {
  return apiRequestJson<ProjectMetadata>(PROJECTS_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function deleteProject(projectId: string): Promise<{ deleted: boolean }> {
  return apiRequestJson<{ deleted: boolean }>(`${PROJECTS_BASE}/${encodeURIComponent(projectId)}`, {
    method: 'DELETE',
  });
}

export async function listBundledSkills(): Promise<BundledSkillEntry[]> {
  return apiRequestJson<BundledSkillEntry[]>(`${SERVER_BASE}/api/skills`, {
    method: 'GET',
  });
}

export async function getProjectOverview(projectId: string): Promise<ProjectOverview> {
  return apiRequestJson<ProjectOverview>(
    `${PROJECTS_BASE}/${encodeURIComponent(projectId)}/overview`,
    { method: 'GET' }
  );
}

export async function createArtifactDir(
  projectId: string,
  input: { name: string; description?: string }
): Promise<ArtifactDirMetadata> {
  return apiRequestJson<ArtifactDirMetadata>(
    `${PROJECTS_BASE}/${encodeURIComponent(projectId)}/artifacts`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  );
}

export async function deleteArtifactDir(
  projectId: string,
  artifactDirId: string
): Promise<{ deleted: boolean }> {
  return apiRequestJson<{ deleted: boolean }>(
    `${PROJECTS_BASE}/${encodeURIComponent(projectId)}/artifacts/${encodeURIComponent(artifactDirId)}`,
    {
      method: 'DELETE',
    }
  );
}

function buildArtifactBase(ctx: ArtifactContext): string {
  return `${PROJECTS_BASE}/${encodeURIComponent(ctx.projectId)}/artifacts/${encodeURIComponent(ctx.artifactId)}`;
}

export async function listInstalledArtifactSkills(
  ctx: ArtifactContext
): Promise<InstalledArtifactSkill[]> {
  return apiRequestJson<InstalledArtifactSkill[]>(`${buildArtifactBase(ctx)}/skills`, {
    method: 'GET',
  });
}

export async function installArtifactSkill(
  ctx: ArtifactContext,
  input: { skillName: string }
): Promise<InstallArtifactSkillResult> {
  return apiRequestJson<InstallArtifactSkillResult>(`${buildArtifactBase(ctx)}/skills`, {
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
): Promise<ArtifactFileResult> {
  const params = new URLSearchParams({ path: input.path });
  if (typeof input.maxBytes === 'number' && Number.isFinite(input.maxBytes)) {
    params.set('maxBytes', `${Math.floor(input.maxBytes)}`);
  }

  return apiRequestJson<ArtifactFileResult>(`${buildArtifactBase(ctx)}/file?${params.toString()}`, {
    method: 'GET',
  });
}

export function getArtifactRawFileUrl(ctx: ArtifactContext, input: { path: string }): string {
  const params = new URLSearchParams({ path: input.path });
  return `${buildArtifactBase(ctx)}/file/raw?${params.toString()}`;
}

export async function renameArtifactPath(
  ctx: ArtifactContext,
  input: { path: string; newName: string }
): Promise<ArtifactPathRenameResult> {
  return apiRequestJson<ArtifactPathRenameResult>(`${buildArtifactBase(ctx)}/path/rename`, {
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
): Promise<ArtifactPathDeleteResult> {
  const params = new URLSearchParams({ path: input.path });
  return apiRequestJson<ArtifactPathDeleteResult>(
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
