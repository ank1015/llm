import { apiRequestJson, SERVER_BASE } from './http';

import type {
  DeleteKeyResponse,
  KeyProviderDetailsResponse,
  KeyProviderStatusDto,
  KeysListResponse,
  ReloadKeyResponse,
  SetKeyResponse,
} from '@ank1015/llm-app-contracts';
import type { Api } from '@ank1015/llm-types';

const KEYS_BASE = `${SERVER_BASE}/api/keys`;

export async function listKeys(): Promise<KeyProviderStatusDto[]> {
  const response = await apiRequestJson<KeysListResponse>(KEYS_BASE, {
    method: 'GET',
  });

  return response.providers;
}

export async function getKeyDetails(api: Api): Promise<KeyProviderDetailsResponse> {
  return apiRequestJson<KeyProviderDetailsResponse>(`${KEYS_BASE}/${encodeURIComponent(api)}`, {
    method: 'GET',
  });
}

export async function setKey(api: Api, key: string): Promise<SetKeyResponse> {
  return apiRequestJson<SetKeyResponse>(`${KEYS_BASE}/${encodeURIComponent(api)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  });
}

export async function clearKey(api: Api): Promise<DeleteKeyResponse> {
  return apiRequestJson<DeleteKeyResponse>(`${KEYS_BASE}/${encodeURIComponent(api)}`, {
    method: 'DELETE',
  });
}

export async function reloadKey(api: Api): Promise<ReloadKeyResponse> {
  return apiRequestJson<ReloadKeyResponse>(`${KEYS_BASE}/${encodeURIComponent(api)}/reload`, {
    method: 'POST',
  });
}
