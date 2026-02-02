/**
 * API Key Queries
 *
 * TanStack Query hooks for managing API keys.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '../api';

import type { Api } from '@ank1015/llm-types';
import type { UseQueryResult, UseMutationResult } from '@tanstack/react-query';

/** Response from GET /keys */
interface KeysListResponse {
  providers: Api[];
}

/** Response from GET /keys/:api */
interface KeyStatusResponse {
  provider: Api;
  exists: boolean;
}

/** Response from POST/PUT /keys/:api */
interface KeySaveResponse {
  provider: Api;
  message: string;
}

/** Response from DELETE /keys/:api */
interface KeyDeleteResponse {
  provider: Api;
  message: string;
}

/** Query keys for cache management */
export const keysQueryKeys = {
  all: ['keys'] as const,
  list: () => [...keysQueryKeys.all, 'list'] as const,
  status: (api: Api) => [...keysQueryKeys.all, 'status', api] as const,
};

/**
 * Hook to get list of providers with stored API keys.
 */
export function useKeysQuery(): UseQueryResult<KeysListResponse, Error> {
  return useQuery({
    queryKey: keysQueryKeys.list(),
    queryFn: () => apiFetch<KeysListResponse>('/keys'),
  });
}

/**
 * Hook to check if an API key exists for a provider.
 */
export function useKeyStatusQuery(api: Api): UseQueryResult<KeyStatusResponse, Error> {
  return useQuery({
    queryKey: keysQueryKeys.status(api),
    queryFn: () => apiFetch<KeyStatusResponse>(`/keys/${api}`),
  });
}

/**
 * Hook to save an API key for a provider.
 */
export function useSaveKeyMutation(): UseMutationResult<
  KeySaveResponse,
  Error,
  { api: Api; apiKey: string }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ api, apiKey }: { api: Api; apiKey: string }) =>
      apiFetch<KeySaveResponse>(`/keys/${api}`, {
        method: 'POST',
        body: JSON.stringify({ apiKey }),
      }),
    onSuccess: (_data, variables) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: keysQueryKeys.list() });
      queryClient.invalidateQueries({
        queryKey: keysQueryKeys.status(variables.api),
      });
    },
  });
}

/**
 * Hook to delete an API key for a provider.
 */
export function useDeleteKeyMutation(): UseMutationResult<KeyDeleteResponse, Error, Api> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (api: Api) =>
      apiFetch<KeyDeleteResponse>(`/keys/${api}`, {
        method: 'DELETE',
      }),
    onSuccess: (_data, api) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: keysQueryKeys.list() });
      queryClient.invalidateQueries({ queryKey: keysQueryKeys.status(api) });
    },
  });
}
