'use client';

import { create } from 'zustand';

import type { ArtifactDirWithSessions, OverviewSession } from '@/lib/client-api';

type SidebarStoreState = {
  projectName: string | null;
  artifactDirs: ArtifactDirWithSessions[];
  isLoading: boolean;

  setProjectName: (name: string) => void;
  setArtifactDirs: (dirs: ArtifactDirWithSessions[]) => void;
  setIsLoading: (loading: boolean) => void;

  /** Optimistically insert a new session into an artifact's session list. */
  addSession: (artifactId: string, session: OverviewSession) => void;

  /** Optimistically rename a session across all artifacts. */
  renameSession: (sessionId: string, sessionName: string) => void;

  /** Optimistically remove a session from an artifact. */
  removeSession: (artifactId: string, sessionId: string) => void;
};

export const useSidebarStore = create<SidebarStoreState>((set) => ({
  projectName: null,
  artifactDirs: [],
  isLoading: true,

  setProjectName: (name) => set({ projectName: name }),
  setArtifactDirs: (dirs) => set({ artifactDirs: dirs }),
  setIsLoading: (loading) => set({ isLoading: loading }),

  addSession: (artifactId, session) =>
    set((state) => ({
      artifactDirs: state.artifactDirs.map((dir) =>
        dir.id === artifactId ? { ...dir, sessions: [session, ...dir.sessions] } : dir
      ),
    })),

  renameSession: (sessionId, sessionName) =>
    set((state) => ({
      artifactDirs: state.artifactDirs.map((dir) => ({
        ...dir,
        sessions: dir.sessions.map((s) => (s.sessionId === sessionId ? { ...s, sessionName } : s)),
      })),
    })),

  removeSession: (artifactId, sessionId) =>
    set((state) => ({
      artifactDirs: state.artifactDirs.map((dir) =>
        dir.id === artifactId
          ? {
              ...dir,
              sessions: dir.sessions.filter((session) => session.sessionId !== sessionId),
            }
          : dir
      ),
    })),
}));
