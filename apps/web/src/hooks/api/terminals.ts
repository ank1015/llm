"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createTerminal, deleteTerminal, getTerminal, listTerminals } from "@/lib/client-api";
import { queryKeys } from "@/lib/query-keys";

import { invalidateQueryKeys } from "./utils";

import type { ArtifactContext } from "@/lib/client-api";
import type { CreateTerminalRequest } from "@ank1015/llm-server/contracts";

export function useTerminalsQuery(ctx: ArtifactContext) {
  return useQuery({
    queryKey: queryKeys.terminals.list(ctx),
    queryFn: () => listTerminals(ctx),
  });
}

export function useTerminalQuery(ctx: ArtifactContext, terminalId: string) {
  return useQuery({
    queryKey: queryKeys.terminals.detail(ctx, terminalId),
    queryFn: () => getTerminal(ctx, terminalId),
  });
}

export function useCreateTerminalMutation(ctx: ArtifactContext) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input?: CreateTerminalRequest) => createTerminal(ctx, input),
    onSuccess: async () => {
      await invalidateQueryKeys(queryClient, [queryKeys.terminals.list(ctx)]);
    },
  });
}

export function useDeleteTerminalMutation(
  ctx: ArtifactContext,
  terminalId: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => deleteTerminal(ctx, terminalId),
    onSuccess: async () => {
      await invalidateQueryKeys(queryClient, [
        queryKeys.terminals.list(ctx),
        queryKeys.terminals.detail(ctx, terminalId),
      ]);
    },
  });
}
