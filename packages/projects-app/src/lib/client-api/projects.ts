import { apiRequestJson, SERVER_BASE } from './http';

const PROJECTS_BASE = `${SERVER_BASE}/api/projects`;

export type ProjectMetadata = {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string | null;
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
