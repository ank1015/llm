import { create } from 'zustand';

import type { DisplayMessage, SessionSummary } from '@/lib/types';

type SessionsState = {
  /** Sessions keyed by artifactDirId */
  sessionsByDir: Record<string, SessionSummary[]>;
  setSessions: (artifactDirId: string, sessions: SessionSummary[]) => void;
  addSession: (artifactDirId: string, session: SessionSummary) => void;

  /** Messages keyed by sessionId */
  messagesBySession: Record<string, DisplayMessage[]>;
  setMessages: (sessionId: string, messages: DisplayMessage[]) => void;
  appendMessages: (sessionId: string, messages: DisplayMessage[]) => void;
};

export const useSessionsStore = create<SessionsState>((set) => ({
  sessionsByDir: {},
  messagesBySession: {},

  setSessions: (artifactDirId, sessions) =>
    set((state) => ({
      sessionsByDir: { ...state.sessionsByDir, [artifactDirId]: sessions },
    })),

  addSession: (artifactDirId, session) =>
    set((state) => {
      const existing = state.sessionsByDir[artifactDirId] ?? [];
      return {
        sessionsByDir: {
          ...state.sessionsByDir,
          [artifactDirId]: [...existing, session],
        },
      };
    }),

  setMessages: (sessionId, messages) =>
    set((state) => ({
      messagesBySession: { ...state.messagesBySession, [sessionId]: messages },
    })),

  appendMessages: (sessionId, messages) =>
    set((state) => {
      const existing = state.messagesBySession[sessionId] ?? [];
      return {
        messagesBySession: {
          ...state.messagesBySession,
          [sessionId]: [...existing, ...messages],
        },
      };
    }),
}));
