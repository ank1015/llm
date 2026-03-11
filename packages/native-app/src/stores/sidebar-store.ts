'use client';

import { create } from 'zustand';

import type {
  ArtifactDirMetadata,
  ArtifactDirWithSessions,
  OverviewSession,
} from '@/lib/client-api';

import { getProjectOverview } from '@/lib/client-api';

type SidebarStoreState = {
  projectName: string | null;
  artifactDirs: ArtifactDirWithSessions[];
  isLoading: boolean;
  error: string | null;

  setProjectName: (name: string | null) => void;
  setArtifactDirs: (dirs: ArtifactDirWithSessions[]) => void;
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  refreshOverview: (
    projectId: string,
    options?: {
      mode?: 'initial' | 'refresh';
    }
  ) => Promise<void>;
  reset: () => void;

  /** Optimistically insert a new artifact into the current project. */
  addArtifactDir: (artifact: ArtifactDirMetadata) => void;

  /** Optimistically insert a new session into an artifact's session list. */
  addSession: (artifactId: string, session: OverviewSession) => void;

  /** Optimistically rename a session across all artifacts. */
  renameSession: (sessionId: string, sessionName: string) => void;

  /** Optimistically remove a session from an artifact. */
  removeSession: (artifactId: string, sessionId: string) => void;
};

const initialState = {
  projectName: null,
  artifactDirs: [] as ArtifactDirWithSessions[],
  isLoading: true,
  error: null as string | null,
};

let latestOverviewRequestId = 0;

export const useSidebarStore = create<SidebarStoreState>((set) => ({
  ...initialState,

  setProjectName: (name) => set({ projectName: name }),
  setArtifactDirs: (dirs) => set({ artifactDirs: dirs }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  refreshOverview: async (projectId, options) => {
    const mode = options?.mode ?? 'refresh';
    const requestId = ++latestOverviewRequestId;

    if (mode === 'initial') {
      set({
        projectName: null,
        artifactDirs: [],
        isLoading: true,
        error: null,
      });
    } else {
      set({ error: null });
    }

    try {
      const overview = await getProjectOverview(projectId);

      if (requestId !== latestOverviewRequestId) {
        return;
      }

      set({
        projectName: overview.project.name,
        artifactDirs: overview.artifactDirs,
        error: null,
      });
    } catch (error) {
      if (requestId !== latestOverviewRequestId) {
        return;
      }

      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Failed to load the project overview.';

      set((state) => ({
        projectName: mode === 'initial' ? null : state.projectName,
        artifactDirs: mode === 'initial' ? [] : state.artifactDirs,
        error: message,
      }));
    } finally {
      if (mode === 'initial' && requestId === latestOverviewRequestId) {
        set({ isLoading: false });
      }
    }
  },
  reset: () => {
    latestOverviewRequestId += 1;
    set(initialState);
  },

  addArtifactDir: (artifact) =>
    set((state) => ({
      error: null,
      artifactDirs: [
        { ...artifact, sessions: [] },
        ...state.artifactDirs.filter((dir) => dir.id !== artifact.id),
      ],
    })),

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
