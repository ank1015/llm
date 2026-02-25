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
