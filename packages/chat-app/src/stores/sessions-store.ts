'use client';

import { create } from 'zustand';

import type { SessionRef, SessionScope } from '@/lib/contracts';
import type { SessionSummary } from '@ank1015/llm-sdk';

import {
  createSession as createSessionApi,
  deleteSession as deleteSessionApi,
  listSessions,
  renameSession as renameSessionApi,
} from '@/lib/client-api';

type SessionsStoreState = {
  sessions: SessionSummary[];
  query: string;
  scope: SessionScope;
  pageSize: number;
  offset: number;
  total: number;
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  isRefreshing: boolean;
  error: string | null;
  isCreating: boolean;
  renamingSessionId: string | null;
  deletingSessionId: string | null;
  mutationError: string | null;
  setQuery: (query: string) => void;
  setScope: (scope: SessionScope) => void;
  clearMutationError: () => void;
  fetchFirstPage: () => Promise<void>;
  fetchNextPage: () => Promise<void>;
  refresh: () => Promise<void>;
  createSession: (input?: { sessionName?: string; scope?: SessionScope }) => Promise<SessionRef>;
  renameSession: (input: {
    sessionId: string;
    sessionName: string;
    scope?: SessionScope;
  }) => Promise<void>;
  deleteSession: (input: { sessionId: string; scope?: SessionScope }) => Promise<void>;
  reset: () => void;
  optimisticRenameSession: (sessionId: string, sessionName: string) => void;
  optimisticRemoveSession: (sessionId: string) => void;
  upsertSession: (session: SessionSummary) => void;
};

const DEFAULT_PAGE_SIZE = 20;

let latestRequestId = 0;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Unknown error while loading sessions.';
}

function mergeSessions(existing: SessionSummary[], incoming: SessionSummary[]): SessionSummary[] {
  if (incoming.length === 0) {
    return existing;
  }

  const indexById = new Map<string, number>();
  const merged = [...existing];

  for (const [index, session] of merged.entries()) {
    indexById.set(session.sessionId, index);
  }

  for (const session of incoming) {
    const existingIndex = indexById.get(session.sessionId);
    if (existingIndex === undefined) {
      indexById.set(session.sessionId, merged.length);
      merged.push(session);
      continue;
    }

    merged[existingIndex] = session;
  }

  return merged;
}

const initialState = {
  sessions: [] as SessionSummary[],
  query: '',
  scope: {} as SessionScope,
  pageSize: DEFAULT_PAGE_SIZE,
  offset: 0,
  total: 0,
  hasMore: false,
  isLoading: false,
  isLoadingMore: false,
  isRefreshing: false,
  error: null as string | null,
  isCreating: false,
  renamingSessionId: null as string | null,
  deletingSessionId: null as string | null,
  mutationError: null as string | null,
};

export const useSessionsStore = create<SessionsStoreState>((set, get) => ({
  ...initialState,

  setQuery: (query) => {
    set({
      query,
      sessions: [],
      offset: 0,
      total: 0,
      hasMore: false,
      error: null,
    });
  },

  setScope: (scope) => {
    set({
      scope,
      sessions: [],
      offset: 0,
      total: 0,
      hasMore: false,
      error: null,
    });
  },

  clearMutationError: () => {
    set({ mutationError: null });
  },

  fetchFirstPage: async () => {
    const requestId = ++latestRequestId;
    const { pageSize, scope, query } = get();

    set({
      isLoading: true,
      isLoadingMore: false,
      isRefreshing: false,
      error: null,
    });

    try {
      const result = await listSessions({
        ...scope,
        query,
        limit: pageSize,
        offset: 0,
      });

      if (requestId !== latestRequestId) {
        return;
      }

      set({
        sessions: result.sessions,
        offset: result.sessions.length,
        total: result.total,
        hasMore: result.sessions.length < result.total,
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

  fetchNextPage: async () => {
    const { isLoading, isLoadingMore, isRefreshing, hasMore, pageSize, offset, scope, query } =
      get();

    if (isLoading || isLoadingMore || isRefreshing || !hasMore) {
      return;
    }

    const requestId = ++latestRequestId;

    set({ isLoadingMore: true, error: null });

    try {
      const result = await listSessions({
        ...scope,
        query,
        limit: pageSize,
        offset,
      });

      if (requestId !== latestRequestId) {
        return;
      }

      set((state) => {
        const mergedSessions = mergeSessions(state.sessions, result.sessions);

        return {
          sessions: mergedSessions,
          offset: mergedSessions.length,
          total: result.total,
          hasMore: mergedSessions.length < result.total,
          isLoadingMore: false,
        };
      });
    } catch (error) {
      if (requestId !== latestRequestId) {
        return;
      }

      set({
        isLoadingMore: false,
        error: getErrorMessage(error),
      });
    }
  },

  refresh: async () => {
    const requestId = ++latestRequestId;
    const { pageSize, scope, query } = get();

    set({
      isRefreshing: true,
      error: null,
    });

    try {
      const result = await listSessions({
        ...scope,
        query,
        limit: pageSize,
        offset: 0,
      });

      if (requestId !== latestRequestId) {
        return;
      }

      set({
        sessions: result.sessions,
        offset: result.sessions.length,
        total: result.total,
        hasMore: result.sessions.length < result.total,
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

  createSession: async (input) => {
    const scope = input?.scope ?? get().scope;

    set({
      isCreating: true,
      mutationError: null,
    });

    try {
      const payload = await createSessionApi({
        projectName: scope.projectName,
        path: scope.path,
        sessionName: input?.sessionName,
      });

      await get().refresh();

      return {
        sessionId: payload.sessionId,
        projectName: payload.projectName,
        path: payload.path,
      };
    } catch (error) {
      const message = getErrorMessage(error);
      set({ mutationError: message });
      throw error;
    } finally {
      set({ isCreating: false });
    }
  },

  renameSession: async ({ sessionId, sessionName, scope }) => {
    const trimmedName = sessionName.trim();
    if (trimmedName.length === 0) {
      throw new Error('Session name cannot be empty.');
    }

    const targetScope = scope ?? get().scope;
    const previousSession = get().sessions.find((session) => session.sessionId === sessionId);
    const previousName = previousSession?.sessionName;

    set({
      renamingSessionId: sessionId,
      mutationError: null,
    });

    get().optimisticRenameSession(sessionId, trimmedName);

    try {
      await renameSessionApi({
        sessionId,
        projectName: targetScope.projectName,
        path: targetScope.path,
        sessionName: trimmedName,
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

  deleteSession: async ({ sessionId, scope }) => {
    const targetScope = scope ?? get().scope;
    const hadSession = get().sessions.some((session) => session.sessionId === sessionId);

    set({
      deletingSessionId: sessionId,
      mutationError: null,
    });

    if (hadSession) {
      get().optimisticRemoveSession(sessionId);
    }

    try {
      await deleteSessionApi({
        sessionId,
        projectName: targetScope.projectName,
        path: targetScope.path,
      });
    } catch (error) {
      set({
        mutationError: getErrorMessage(error),
      });

      if (hadSession) {
        await get().refresh();
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
    set((state) => {
      const nextSessions = state.sessions.filter((session) => session.sessionId !== sessionId);
      const removed = nextSessions.length !== state.sessions.length;

      return {
        sessions: nextSessions,
        offset: nextSessions.length,
        total: removed ? Math.max(state.total - 1, 0) : state.total,
        hasMore: nextSessions.length < (removed ? Math.max(state.total - 1, 0) : state.total),
      };
    });
  },

  upsertSession: (session) => {
    set((state) => {
      const index = state.sessions.findIndex((item) => item.sessionId === session.sessionId);

      if (index === -1) {
        return {
          sessions: [session, ...state.sessions],
          offset: state.offset + 1,
          total: state.total + 1,
          hasMore: state.offset + 1 < state.total + 1,
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
