"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getSessionMessages, getSessionTree, promptSession } from "@/lib/client-api";
import { queryKeys } from "@/lib/query-keys";

import { invalidateQueryKeys } from "./utils";

import type { ArtifactContext, PromptSessionRequest } from "@/lib/client-api";

export function useSessionMessagesQuery(
  ctx: ArtifactContext,
  sessionId: string,
) {
  return useQuery({
    queryKey: queryKeys.sessions.messages(ctx, sessionId),
    queryFn: () => getSessionMessages(ctx, sessionId),
  });
}

export function useSessionTreeQuery(ctx: ArtifactContext, sessionId: string) {
  return useQuery({
    queryKey: queryKeys.sessions.tree(ctx, sessionId),
    queryFn: () => getSessionTree(ctx, sessionId),
  });
}

export function usePromptSessionMutation(ctx: ArtifactContext, sessionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Omit<PromptSessionRequest, keyof ArtifactContext | "sessionId">) =>
      promptSession({
        ...input,
        projectId: ctx.projectId,
        artifactId: ctx.artifactId,
        sessionId,
      }),
    onSuccess: async () => {
      await invalidateQueryKeys(queryClient, [
        queryKeys.sessions.detail(ctx, sessionId),
        queryKeys.sessions.messages(ctx, sessionId),
        queryKeys.sessions.tree(ctx, sessionId),
      ]);
    },
  });
}
