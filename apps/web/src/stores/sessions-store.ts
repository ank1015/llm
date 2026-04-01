"use client";

import { create } from "zustand";

import {
  createSession as createSessionApi,
  deleteSession as deleteSessionApi,
  listSessions,
  renameSession as renameSessionApi,
} from "@/lib/client-api";
import { getBrowserQueryClient } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";

import type {
  ArtifactContext,
  CuratedModelIdContract,
  SessionMetadataDto,
  SessionSummaryDto,
} from "@/lib/client-api";
import type { ProjectOverviewDto } from "@ank1015/llm-server/contracts";

type CreateSessionStoreInput = {
  sessionName?: string;
  modelId: CuratedModelIdContract;
};

type SessionsStoreState = {
  sessions: SessionSummaryDto[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  isCreating: boolean;
  renamingSessionId: string | null;
  deletingSessionId: string | null;
  mutationError: string | null;
  clearMutationError: () => void;
  fetchSessions: (ctx: ArtifactContext) => Promise<void>;
  refresh: (ctx: ArtifactContext) => Promise<void>;
  createSession: (
    ctx: ArtifactContext,
    input: CreateSessionStoreInput,
  ) => Promise<{ sessionId: string }>;
  renameSession: (
    ctx: ArtifactContext,
    input: { sessionId: string; sessionName: string },
  ) => Promise<void>;
  deleteSession: (ctx: ArtifactContext, sessionId: string) => Promise<void>;
  reset: () => void;
  optimisticRenameSession: (sessionId: string, sessionName: string) => void;
  optimisticRemoveSession: (sessionId: string) => void;
  upsertSession: (session: SessionSummaryDto) => void;
};

let latestRequestId = 0;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unknown error while loading sessions.";
}

const initialState = {
  sessions: [] as SessionSummaryDto[],
  isLoading: false,
  isRefreshing: false,
  error: null as string | null,
  isCreating: false,
  renamingSessionId: null as string | null,
  deletingSessionId: null as string | null,
  mutationError: null as string | null,
};

function syncOverviewSessionName(
  ctx: ArtifactContext,
  sessionId: string,
  sessionName: string,
): void {
  const queryClient = getBrowserQueryClient();
  queryClient.setQueryData<ProjectOverviewDto | undefined>(
    queryKeys.projects.overview(ctx.projectId),
    (overview) => {
      if (!overview) {
        return overview;
      }

      return {
        ...overview,
        artifactDirs: overview.artifactDirs.map((artifact) => ({
          ...artifact,
          sessions: artifact.sessions.map((session) =>
            session.sessionId === sessionId ? { ...session, sessionName } : session,
          ),
        })),
      };
    },
  );
}

function removeOverviewSession(ctx: ArtifactContext, sessionId: string): void {
  const queryClient = getBrowserQueryClient();
  queryClient.setQueryData<ProjectOverviewDto | undefined>(
    queryKeys.projects.overview(ctx.projectId),
    (overview) => {
      if (!overview) {
        return overview;
      }

      return {
        ...overview,
        artifactDirs: overview.artifactDirs.map((artifact) =>
          artifact.id === ctx.artifactId
            ? {
                ...artifact,
                sessions: artifact.sessions.filter((session) => session.sessionId !== sessionId),
              }
            : artifact,
        ),
      };
    },
  );
}

function upsertSessionsCache(ctx: ArtifactContext, sessions: SessionSummaryDto[]): void {
  getBrowserQueryClient().setQueryData(queryKeys.sessions.list(ctx), sessions);
}

async function fetchSessionsFromCache(
  ctx: ArtifactContext,
  force = false,
): Promise<SessionSummaryDto[]> {
  const queryClient = getBrowserQueryClient();
  if (force) {
    await queryClient.invalidateQueries({ queryKey: queryKeys.sessions.list(ctx) });
  }

  return queryClient.fetchQuery({
    queryKey: queryKeys.sessions.list(ctx),
    queryFn: () => listSessions(ctx),
  });
}

export const useSessionsStore = create<SessionsStoreState>((set, get) => ({
  ...initialState,

  clearMutationError: () => {
    set({ mutationError: null });
  },

  fetchSessions: async (ctx) => {
    const requestId = ++latestRequestId;

    set({
      isLoading: true,
      isRefreshing: false,
      error: null,
    });

    try {
      const sessions = await fetchSessionsFromCache(ctx);
      if (requestId !== latestRequestId) {
        return;
      }

      set({
        sessions,
        isLoading: false,
      });
    } catch (error) {
      if (requestId !== latestRequestId) {
        return;
      }

      set({
        isLoading: false,
        error: getErrorMessage(error),
      });
    }
  },

  refresh: async (ctx) => {
    const requestId = ++latestRequestId;

    set({
      isRefreshing: true,
      error: null,
    });

    try {
      const sessions = await fetchSessionsFromCache(ctx, true);
      if (requestId !== latestRequestId) {
        return;
      }

      set({
        sessions,
        isRefreshing: false,
      });
    } catch (error) {
      if (requestId !== latestRequestId) {
        return;
      }

      set({
        isRefreshing: false,
        error: getErrorMessage(error),
      });
    }
  },

  createSession: async (ctx, input) => {
    const queryClient = getBrowserQueryClient();
    set({
      isCreating: true,
      mutationError: null,
    });

    try {
      const metadata = await createSessionApi(ctx, {
        ...(input.sessionName?.trim() ? { name: input.sessionName.trim() } : {}),
        modelId: input.modelId,
      });

      queryClient.setQueryData(queryKeys.sessions.detail(ctx, metadata.id), metadata);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.sessions.list(ctx) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.overview(ctx.projectId) }),
      ]);
      await get().refresh(ctx);

      return {
        sessionId: metadata.id,
      };
    } catch (error) {
      const message = getErrorMessage(error);
      set({ mutationError: message });
      throw error;
    } finally {
      set({ isCreating: false });
    }
  },

  renameSession: async (ctx, { sessionId, sessionName }) => {
    const trimmedName = sessionName.trim();
    if (trimmedName.length === 0) {
      throw new Error("Session name cannot be empty.");
    }

    const queryClient = getBrowserQueryClient();
    const previousSessions = get().sessions;
    const previousSession = previousSessions.find((session) => session.sessionId === sessionId);
    const previousName = previousSession?.sessionName;

    set({
      renamingSessionId: sessionId,
      mutationError: null,
    });

    get().optimisticRenameSession(sessionId, trimmedName);
    upsertSessionsCache(ctx, useSessionsStore.getState().sessions);
    syncOverviewSessionName(ctx, sessionId, trimmedName);

    try {
      await renameSessionApi(ctx, {
        sessionId,
        name: trimmedName,
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.sessions.list(ctx) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.sessions.scope(ctx, sessionId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.overview(ctx.projectId) }),
      ]);
    } catch (error) {
      if (previousName) {
        get().optimisticRenameSession(sessionId, previousName);
      } else {
        set({ sessions: previousSessions });
      }

      upsertSessionsCache(ctx, useSessionsStore.getState().sessions);
      if (previousName) {
        syncOverviewSessionName(ctx, sessionId, previousName);
      }

      set({
        mutationError: getErrorMessage(error),
      });
      throw error;
    } finally {
      set({
        renamingSessionId: null,
      });
    }
  },

  deleteSession: async (ctx, sessionId) => {
    const queryClient = getBrowserQueryClient();
    const previousSessions = get().sessions;
    const hadSession = previousSessions.some((session) => session.sessionId === sessionId);

    set({
      deletingSessionId: sessionId,
      mutationError: null,
    });

    if (hadSession) {
      get().optimisticRemoveSession(sessionId);
      upsertSessionsCache(ctx, useSessionsStore.getState().sessions);
      removeOverviewSession(ctx, sessionId);
    }

    try {
      await deleteSessionApi(ctx, sessionId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.sessions.list(ctx) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.sessions.scope(ctx, sessionId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.overview(ctx.projectId) }),
      ]);
    } catch (error) {
      set({
        mutationError: getErrorMessage(error),
        sessions: previousSessions,
      });
      upsertSessionsCache(ctx, previousSessions);

      if (hadSession) {
        await get().refresh(ctx);
      }

      throw error;
    } finally {
      set({
        deletingSessionId: null,
      });
    }
  },

  reset: () => {
    set(initialState);
  },

  optimisticRenameSession: (sessionId, sessionName) => {
    const trimmedName = sessionName.trim();
    if (trimmedName.length === 0) {
      return;
    }

    set((state) => ({
      sessions: state.sessions.map((session) =>
        session.sessionId === sessionId ? { ...session, sessionName: trimmedName } : session,
      ),
    }));
  },

  optimisticRemoveSession: (sessionId) => {
    set((state) => ({
      sessions: state.sessions.filter((session) => session.sessionId !== sessionId),
    }));
  },

  upsertSession: (session) => {
    set((state) => {
      const index = state.sessions.findIndex((item) => item.sessionId === session.sessionId);

      if (index === -1) {
        return {
          sessions: [session, ...state.sessions],
        };
      }

      const nextSessions = [...state.sessions];
      nextSessions[index] = session;

      return {
        sessions: nextSessions,
      };
    });
  },
}));

export type { CreateSessionStoreInput, SessionMetadataDto };
