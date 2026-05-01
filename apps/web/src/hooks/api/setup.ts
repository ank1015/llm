'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  SetupAgentCancelResponse,
  SetupAgentStartResponse,
  SetupCompleteResult,
  SetupStatus,
} from '@/lib/client-api';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';

import { cancelSetupAgentRun, completeSetup, getSetupStatus, startSetupAgent } from '@/lib/client-api';
import { queryKeys } from '@/lib/query-keys';

export function useSetupStatusQuery(options?: {
  enabled?: boolean;
}): UseQueryResult<SetupStatus> {
  return useQuery({
    queryKey: queryKeys.setup.status(),
    queryFn: getSetupStatus,
    enabled: options?.enabled ?? true,
  });
}

export function useCompleteSetupMutation(): UseMutationResult<SetupCompleteResult, Error, void> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => completeSetup(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.setup.status() });
    },
  });
}

export function useStartSetupAgentMutation(): UseMutationResult<
  SetupAgentStartResponse,
  Error,
  void
> {
  return useMutation({
    mutationFn: () => startSetupAgent(),
  });
}

export function useCancelSetupAgentMutation(): UseMutationResult<
  SetupAgentCancelResponse,
  Error,
  string
> {
  return useMutation({
    mutationFn: (runId: string) => cancelSetupAgentRun(runId),
  });
}
