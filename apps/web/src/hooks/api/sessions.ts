"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createSession,
  deleteSession,
  generateSessionName,
  getSession,
  listSessions,
  renameSession,
} from "@/lib/client-api";
import { queryKeys } from "@/lib/query-keys";

import { invalidateQueryKeys } from "./utils";

import type {
  ArtifactContext,
  CreateSessionInput,
  GenerateSessionNameInput,
  RenameSessionInput,
} from "@/lib/client-api";

export function useSessionsQuery(ctx: ArtifactContext) {
  return useQuery({
    queryKey: queryKeys.sessions.list(ctx),
    queryFn: () => listSessions(ctx),
  });
}

export function useSessionQuery(ctx: ArtifactContext, sessionId: string) {
  return useQuery({
    queryKey: queryKeys.sessions.detail(ctx, sessionId),
    queryFn: () => getSession(ctx, sessionId),
  });
}

export function useCreateSessionMutation(ctx: ArtifactContext) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateSessionInput) => createSession(ctx, input),
    onSuccess: async () => {
      await invalidateQueryKeys(queryClient, [
        queryKeys.sessions.list(ctx),
        queryKeys.projects.overview(ctx.projectId),
      ]);
    },
  });
}

export function useRenameSessionMutation(ctx: ArtifactContext) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: RenameSessionInput) => renameSession(ctx, input),
    onSuccess: async (_response, input) => {
      await invalidateQueryKeys(queryClient, [
        queryKeys.sessions.list(ctx),
        queryKeys.sessions.scope(ctx, input.sessionId),
        queryKeys.projects.overview(ctx.projectId),
      ]);
    },
  });
}

export function useGenerateSessionNameMutation(ctx: ArtifactContext) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: GenerateSessionNameInput) => generateSessionName(ctx, input),
    onSuccess: async (_response, input) => {
      await invalidateQueryKeys(queryClient, [
        queryKeys.sessions.list(ctx),
        queryKeys.sessions.scope(ctx, input.sessionId),
        queryKeys.projects.overview(ctx.projectId),
      ]);
    },
  });
}

export function useDeleteSessionMutation(ctx: ArtifactContext, sessionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => deleteSession(ctx, sessionId),
    onSuccess: async () => {
      await invalidateQueryKeys(queryClient, [
        queryKeys.sessions.list(ctx),
        queryKeys.sessions.scope(ctx, sessionId),
        queryKeys.projects.overview(ctx.projectId),
      ]);
    },
  });
}
