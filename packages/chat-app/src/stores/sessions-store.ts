'use client';

import { create } from 'zustand';

import type { SessionSummary } from '@ank1015/llm-sdk';

type SessionScope = {
  projectName?: string;
  path?: string;
};

type SessionsApiResponse = {
  ok: boolean;
  total: number;
  count: number;
  sessions: SessionSummary[];
};

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
  setQuery: (query: string) => void;
  setScope: (scope: SessionScope) => void;
  fetchFirstPage: () => Promise<void>;
  fetchNextPage: () => Promise<void>;
  refresh: () => Promise<void>;
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

function buildSessionsUrl(params: {
  scope: SessionScope;
  query: string;
  limit: number;
  offset: number;
}): string {
  const search = new URLSearchParams();

  if (params.scope.projectName) {
    search.set('projectName', params.scope.projectName);
  }

  if (params.scope.path) {
    search.set('path', params.scope.path);
  }

  const trimmedQuery = params.query.trim();
  if (trimmedQuery.length > 0) {
    search.set('query', trimmedQuery);
  }

  search.set('limit', String(params.limit));
  search.set('offset', String(params.offset));

  const queryString = search.toString();
  return queryString.length > 0 ? `/api/sessions?${queryString}` : '/api/sessions';
}

async function fetchSessions(params: {
  scope: SessionScope;
  query: string;
  limit: number;
  offset: number;
}): Promise<SessionsApiResponse> {
  const response = await fetch(buildSessionsUrl(params), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  const body = (await response.json().catch(() => ({}))) as Partial<SessionsApiResponse> & {
    error?: { message?: string };
  };

  if (!response.ok || !body.ok) {
    throw new Error(body.error?.message ?? 'Failed to load sessions.');
  }

  if (!Array.isArray(body.sessions)) {
    throw new Error('Malformed sessions response.');
  }

  return {
    ok: true,
    total: typeof body.total === 'number' ? body.total : body.sessions.length,
    count: typeof body.count === 'number' ? body.count : body.sessions.length,
    sessions: body.sessions,
  };
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
      const result = await fetchSessions({
        scope,
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
      const result = await fetchSessions({
        scope,
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
      const result = await fetchSessions({
        scope,
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
