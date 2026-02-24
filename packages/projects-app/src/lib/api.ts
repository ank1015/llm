import type {
  ArtifactDirMetadata,
  CreateArtifactDirInput,
  CreateProjectInput,
  CreateSessionInput,
  ProjectMetadata,
  ProjectOverview,
  PromptInput,
  SessionMetadata,
  SessionSummary,
} from './types';

const BASE = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = (body as Record<string, string>).error ?? res.statusText;
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export function listProjects(): Promise<ProjectMetadata[]> {
  return request('/projects');
}

export function getProject(projectId: string): Promise<ProjectMetadata> {
  return request(`/projects/${projectId}`);
}

export function createProject(input: CreateProjectInput): Promise<ProjectMetadata> {
  return request('/projects', { method: 'POST', body: JSON.stringify(input) });
}

export function deleteProject(projectId: string): Promise<{ deleted: boolean }> {
  return request(`/projects/${projectId}`, { method: 'DELETE' });
}

export function getProjectOverview(projectId: string): Promise<ProjectOverview> {
  return request(`/projects/${projectId}/overview`);
}

// ---------------------------------------------------------------------------
// Artifact Directories
// ---------------------------------------------------------------------------

export function listArtifactDirs(projectId: string): Promise<ArtifactDirMetadata[]> {
  return request(`/projects/${projectId}/artifacts`);
}

export function getArtifactDir(
  projectId: string,
  artifactDirId: string
): Promise<ArtifactDirMetadata> {
  return request(`/projects/${projectId}/artifacts/${artifactDirId}`);
}

export function createArtifactDir(
  projectId: string,
  input: CreateArtifactDirInput
): Promise<ArtifactDirMetadata> {
  return request(`/projects/${projectId}/artifacts`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function deleteArtifactDir(
  projectId: string,
  artifactDirId: string
): Promise<{ deleted: boolean }> {
  return request(`/projects/${projectId}/artifacts/${artifactDirId}`, { method: 'DELETE' });
}

export function listArtifactFiles(projectId: string, artifactDirId: string): Promise<string[]> {
  return request(`/projects/${projectId}/artifacts/${artifactDirId}/files`);
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

const sessionsBase = (projectId: string, artifactDirId: string) =>
  `/projects/${projectId}/artifacts/${artifactDirId}/sessions`;

export function listSessions(projectId: string, artifactDirId: string): Promise<SessionSummary[]> {
  return request(sessionsBase(projectId, artifactDirId));
}

export function getSession(
  projectId: string,
  artifactDirId: string,
  sessionId: string
): Promise<SessionMetadata> {
  return request(`${sessionsBase(projectId, artifactDirId)}/${sessionId}`);
}

export function createSession(
  projectId: string,
  artifactDirId: string,
  input: CreateSessionInput
): Promise<SessionMetadata> {
  return request(sessionsBase(projectId, artifactDirId), {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getMessages(
  projectId: string,
  artifactDirId: string,
  sessionId: string
): Promise<unknown[]> {
  return request(`${sessionsBase(projectId, artifactDirId)}/${sessionId}/messages`);
}

export function promptSession(
  projectId: string,
  artifactDirId: string,
  sessionId: string,
  input: PromptInput
): Promise<unknown[]> {
  return request(`${sessionsBase(projectId, artifactDirId)}/${sessionId}/prompt`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
