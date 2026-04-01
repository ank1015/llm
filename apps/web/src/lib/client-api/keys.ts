import { apiRequestJson, SERVER_BASE } from "./http";

import type {
  DeleteKeyResponse,
  KeyProviderContract,
  KeyProviderDetailsResponse,
  KeysListResponse,
  ReloadKeyResponse,
  SetKeyRequest,
  SetKeyResponse,
} from "@ank1015/llm-server/contracts";

const KEYS_BASE = `${SERVER_BASE}/api/keys`;

export type KeyCredentialsInput = NonNullable<SetKeyRequest["credentials"]>;

function toProviderPath(provider: KeyProviderContract): string {
  return encodeURIComponent(String(provider));
}

export async function listKeys(): Promise<KeysListResponse> {
  return apiRequestJson<KeysListResponse>(KEYS_BASE, {
    method: "GET",
  });
}

export async function getKeyDetails(
  provider: KeyProviderContract,
): Promise<KeyProviderDetailsResponse> {
  return apiRequestJson<KeyProviderDetailsResponse>(
    `${KEYS_BASE}/${toProviderPath(provider)}`,
    {
      method: "GET",
    },
  );
}

export async function setKey(
  provider: KeyProviderContract,
  credentials: KeyCredentialsInput,
): Promise<SetKeyResponse> {
  return apiRequestJson<SetKeyResponse>(`${KEYS_BASE}/${toProviderPath(provider)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credentials }),
  });
}

export async function clearKey(
  provider: KeyProviderContract,
): Promise<DeleteKeyResponse> {
  return apiRequestJson<DeleteKeyResponse>(`${KEYS_BASE}/${toProviderPath(provider)}`, {
    method: "DELETE",
  });
}

export async function reloadKey(
  provider: KeyProviderContract,
): Promise<ReloadKeyResponse> {
  return apiRequestJson<ReloadKeyResponse>(
    `${KEYS_BASE}/${toProviderPath(provider)}/reload`,
    {
      method: "POST",
    },
  );
}
