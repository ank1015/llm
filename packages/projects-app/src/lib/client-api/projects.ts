import { apiRequestJson, SERVER_BASE } from './http';

const PROJECTS_BASE = `${SERVER_BASE}/api/projects`;

export type ProjectMetadata = {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string | null;
};

export type ArtifactType = 'base' | 'research' | 'code';

export const ARTIFACT_TYPES: readonly ArtifactType[] = ['base', 'research', 'code'] as const;

export type ArtifactDirMetadata = {
  id: string;
  name: string;
  description: string | null;
  type: ArtifactType;
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

export async function getProjectOverview(projectId: string): Promise<ProjectOverview> {
  return apiRequestJson<ProjectOverview>(
    `${PROJECTS_BASE}/${encodeURIComponent(projectId)}/overview`,
    { method: 'GET' }
  );
}

export async function createArtifactDir(
  projectId: string,
  input: { name: string; description?: string; type?: ArtifactType }
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
