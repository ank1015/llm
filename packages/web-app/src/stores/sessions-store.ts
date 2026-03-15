'use client';

import { create } from 'zustand';

import type { ModelSelection, SessionSummaryDto } from '@/lib/client-api';

import {
  createSession as createSessionApi,
  deleteSession as deleteSessionApi,
  listSessions,
  renameSession as renameSessionApi,
} from '@/lib/client-api';

type ArtifactContext = {
  projectId: string;
  artifactId: string;
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
    input: { sessionName?: string } & ModelSelection
  ) => Promise<{ sessionId: string }>;
  renameSession: (
    ctx: ArtifactContext,
    input: { sessionId: string; sessionName: string }
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

  return 'Unknown error while loading sessions.';
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
      const sessions = await listSessions(ctx);

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
      const sessions = await listSessions(ctx);

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
    set({
      isCreating: true,
      mutationError: null,
    });

    try {
      const metadata = await createSessionApi(ctx, {
        name: input?.sessionName,
        api: input.api,
        modelId: input.modelId,
      });

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
      throw new Error('Session name cannot be empty.');
    }

    const previousSession = get().sessions.find((session) => session.sessionId === sessionId);
    const previousName = previousSession?.sessionName;

    set({
      renamingSessionId: sessionId,
      mutationError: null,
    });

    get().optimisticRenameSession(sessionId, trimmedName);

    try {
      await renameSessionApi(ctx, {
        sessionId,
        name: trimmedName,
      });
    } catch (error) {
      if (previousName) {
        get().optimisticRenameSession(sessionId, previousName);
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
    const hadSession = get().sessions.some((session) => session.sessionId === sessionId);

    set({
      deletingSessionId: sessionId,
      mutationError: null,
    });

    if (hadSession) {
      get().optimisticRemoveSession(sessionId);
    }

    try {
      await deleteSessionApi(ctx, sessionId);
    } catch (error) {
      set({
        mutationError: getErrorMessage(error),
      });

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
        session.sessionId === sessionId ? { ...session, sessionName: trimmedName } : session
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
