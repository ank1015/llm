'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { GatewayLoginInput, GatewayLoginResult, GatewaySession } from '@/lib/client-api';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';

import { getGatewaySession, loginGateway } from '@/lib/client-api';
import { queryKeys } from '@/lib/query-keys';

export function useGatewaySessionQuery(): UseQueryResult<GatewaySession> {
  return useQuery({
    queryKey: queryKeys.gateway.session(),
    queryFn: getGatewaySession,
  });
}

export function useGatewayLoginMutation(): UseMutationResult<
  GatewayLoginResult,
  Error,
  GatewayLoginInput
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: GatewayLoginInput) => loginGateway(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.gateway.session() });
    },
  });
}
