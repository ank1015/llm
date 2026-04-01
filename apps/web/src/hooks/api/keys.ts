"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { clearKey, getKeyDetails, listKeys, reloadKey, setKey } from "@/lib/client-api";
import { queryKeys } from "@/lib/query-keys";

import { invalidateQueryKeys } from "./utils";

import type { KeyCredentialsInput } from "@/lib/client-api";
import type { KeyProviderContract } from "@ank1015/llm-server/contracts";

export function useKeysQuery() {
  return useQuery({
    queryKey: queryKeys.keys.list(),
    queryFn: listKeys,
  });
}

export function useKeyDetailsQuery(provider: KeyProviderContract) {
  return useQuery({
    queryKey: queryKeys.keys.detail(provider),
    queryFn: () => getKeyDetails(provider),
  });
}

export function useSetKeyMutation(provider: KeyProviderContract) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (credentials: KeyCredentialsInput) => setKey(provider, credentials),
    onSuccess: async () => {
      await invalidateQueryKeys(queryClient, [
        queryKeys.keys.list(),
        queryKeys.keys.detail(provider),
      ]);
    },
  });
}

export function useClearKeyMutation(provider: KeyProviderContract) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => clearKey(provider),
    onSuccess: async () => {
      await invalidateQueryKeys(queryClient, [
        queryKeys.keys.list(),
        queryKeys.keys.detail(provider),
      ]);
    },
  });
}

export function useReloadKeyMutation(provider: KeyProviderContract) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => reloadKey(provider),
    onSuccess: async () => {
      await invalidateQueryKeys(queryClient, [
        queryKeys.keys.list(),
        queryKeys.keys.detail(provider),
      ]);
    },
  });
}
