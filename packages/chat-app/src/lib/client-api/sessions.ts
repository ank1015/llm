import { apiRequestJson, buildQueryString } from './http';

import type { SessionsListRequest, SessionsListResponse } from '@/lib/contracts';

export async function listSessions(request: SessionsListRequest): Promise<SessionsListResponse> {
  const query = buildQueryString({
    projectName: request.projectName,
    path: request.path,
    query: request.query,
    limit: request.limit,
    offset: request.offset,
  });

  return apiRequestJson<SessionsListResponse>(`/api/sessions${query}`, {
    method: 'GET',
  });
}
