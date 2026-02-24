import { create } from 'zustand';

import type { ProjectMetadata } from '@/lib/types';

type ProjectsState = {
  projects: ProjectMetadata[];
  setProjects: (projects: ProjectMetadata[]) => void;
  addProject: (project: ProjectMetadata) => void;
  removeProject: (id: string) => void;
};

export const useProjectsStore = create<ProjectsState>((set) => ({
  projects: [],

  setProjects: (projects) => set({ projects }),

  addProject: (project) => set((state) => ({ projects: [...state.projects, project] })),

  removeProject: (id) => set((state) => ({ projects: state.projects.filter((p) => p.id !== id) })),
}));
