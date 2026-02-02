import { apiRequestJson, buildQueryString } from './http';

import type { ModelsQuery, ModelsResponse, ProvidersResponse } from '@/lib/contracts';

export async function getProvidersCatalog(): Promise<ProvidersResponse> {
  return apiRequestJson<ProvidersResponse>('/api/providers', {
    method: 'GET',
  });
}

export async function getModelsCatalog(query: ModelsQuery = {}): Promise<ModelsResponse> {
  const params = buildQueryString({
    api: query.api,
    provider: query.provider,
    reasoning: query.reasoning,
    input: query.input,
    tool: query.tool,
  });

  return apiRequestJson<ModelsResponse>(`/api/models${params}`, {
    method: 'GET',
  });
}
