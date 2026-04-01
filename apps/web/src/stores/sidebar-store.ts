"use client";

import { create } from "zustand";

import type { ArtifactDirOverviewDto, SessionSummaryDto } from "@/lib/client-api";

type SidebarStoreState = {
  projectName: string | null;
  artifactDirs: ArtifactDirOverviewDto[];
  isLoading: boolean;
  setProjectName: (name: string) => void;
  setArtifactDirs: (dirs: ArtifactDirOverviewDto[]) => void;
  setIsLoading: (loading: boolean) => void;
  addSession: (artifactId: string, session: SessionSummaryDto) => void;
  renameSession: (sessionId: string, sessionName: string) => void;
  removeSession: (artifactId: string, sessionId: string) => void;
  renameArtifact: (
    artifactId: string,
    artifact: Pick<ArtifactDirOverviewDto, "id" | "name" | "description" | "createdAt">,
  ) => void;
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
        dir.id === artifactId ? { ...dir, sessions: [session, ...dir.sessions] } : dir,
      ),
    })),

  renameSession: (sessionId, sessionName) =>
    set((state) => ({
      artifactDirs: state.artifactDirs.map((dir) => ({
        ...dir,
        sessions: dir.sessions.map((session: SessionSummaryDto) =>
          session.sessionId === sessionId ? { ...session, sessionName } : session,
        ),
      })),
    })),

  removeSession: (artifactId, sessionId) =>
    set((state) => ({
      artifactDirs: state.artifactDirs.map((dir) =>
        dir.id === artifactId
          ? {
              ...dir,
              sessions: dir.sessions.filter(
                (session: SessionSummaryDto) => session.sessionId !== sessionId,
              ),
            }
          : dir,
      ),
    })),

  renameArtifact: (artifactId, artifact) =>
    set((state) => ({
      artifactDirs: state.artifactDirs.map((dir) =>
        dir.id === artifactId
          ? {
              ...dir,
              id: artifact.id,
              name: artifact.name,
              description: artifact.description,
              createdAt: artifact.createdAt,
            }
          : dir,
      ),
    })),
}));
