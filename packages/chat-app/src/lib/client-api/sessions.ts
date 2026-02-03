import { apiRequestJson, buildQueryString } from './http';

import type {
  CreateSessionRequest,
  CreateSessionResponse,
  DeleteSessionRequest,
  DeleteSessionResponse,
  RenameSessionRequest,
  RenameSessionResponse,
  SessionsListRequest,
  SessionsListResponse,
} from '@/lib/contracts';

function normalizeScope<T extends { projectName?: string; path?: string }>(scope: T): T {
  const projectName = scope.projectName?.trim();
  const path = scope.path?.trim();

  return {
    ...scope,
    projectName: projectName && projectName.length > 0 ? projectName : undefined,
    path: path && path.length > 0 ? path : undefined,
  };
}

export async function listSessions(request: SessionsListRequest): Promise<SessionsListResponse> {
  const normalized = normalizeScope(request);

  const query = buildQueryString({
    projectName: normalized.projectName,
    path: normalized.path,
    query: normalized.query,
    limit: normalized.limit,
    offset: normalized.offset,
  });

  return apiRequestJson<SessionsListResponse>(`/api/sessions${query}`, {
    method: 'GET',
  });
}

export async function createSession(request: CreateSessionRequest): Promise<CreateSessionResponse> {
  const normalized = normalizeScope(request);
  const body: Record<string, unknown> = {};

  if (normalized.projectName) {
    body.projectName = normalized.projectName;
  }

  if (normalized.path) {
    body.path = normalized.path;
  }

  if (normalized.sessionName?.trim()) {
    body.sessionName = normalized.sessionName.trim();
  }

  return apiRequestJson<CreateSessionResponse>('/api/sessions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

export async function renameSession(request: RenameSessionRequest): Promise<RenameSessionResponse> {
  const normalized = normalizeScope(request);
  const body: Record<string, unknown> = {
    sessionName: request.sessionName.trim(),
  };

  if (normalized.projectName) {
    body.projectName = normalized.projectName;
  }

  if (normalized.path) {
    body.path = normalized.path;
  }

  return apiRequestJson<RenameSessionResponse>(
    `/api/sessions/${encodeURIComponent(request.sessionId)}/name`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );
}

export async function deleteSession(request: DeleteSessionRequest): Promise<DeleteSessionResponse> {
  const normalized = normalizeScope(request);
  const query = buildQueryString({
    projectName: normalized.projectName,
    path: normalized.path,
  });

  return apiRequestJson<DeleteSessionResponse>(
    `/api/sessions/${encodeURIComponent(request.sessionId)}${query}`,
    {
      method: 'DELETE',
    }
  );
}
