import { create } from 'zustand';

import type { ArtifactDirMetadata } from '@/lib/types';

type ArtifactDirsState = {
  /** Artifact dirs for the currently active project */
  artifactDirs: ArtifactDirMetadata[];
  setArtifactDirs: (dirs: ArtifactDirMetadata[]) => void;
  addArtifactDir: (dir: ArtifactDirMetadata) => void;
  removeArtifactDir: (id: string) => void;
};

export const useArtifactDirsStore = create<ArtifactDirsState>((set) => ({
  artifactDirs: [],

  setArtifactDirs: (artifactDirs) => set({ artifactDirs }),

  addArtifactDir: (dir) => set((state) => ({ artifactDirs: [...state.artifactDirs, dir] })),

  removeArtifactDir: (id) =>
    set((state) => ({
      artifactDirs: state.artifactDirs.filter((d) => d.id !== id),
    })),
}));
