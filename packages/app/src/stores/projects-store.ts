import { create } from 'zustand';

import type { MockProject } from '@/lib/mock-data';

import {
  createBranch as apiCreateBranch,
  createProject as apiCreateProject,
  deleteProject as apiDeleteProject,
  getProjects,
} from '@/lib/client-api';

type ProjectsState = {
  projects: MockProject[];
  isLoading: boolean;
  error: string | null;
  fetchProjects: () => Promise<void>;
  createProject: (name: string) => Promise<MockProject>;
  createBranch: (projectName: string, branchName: string) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
};

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  projects: [],
  isLoading: false,
  error: null,

  createBranch: async (projectName: string, branchName: string) => {
    const branch = await apiCreateBranch(projectName, branchName);
    set((state) => ({
      projects: state.projects.map((p) =>
        p.projectName === projectName ? { ...p, branches: [...p.branches, branch] } : p
      ),
    }));
  },

  deleteProject: async (projectId: string) => {
    await apiDeleteProject(projectId);
    set((state) => ({ projects: state.projects.filter((p) => p.projectId !== projectId) }));
  },

  createProject: async (name: string) => {
    const project = await apiCreateProject(name);
    set((state) => ({ projects: [...state.projects, project] }));
    return project;
  },

  fetchProjects: async () => {
    // Idempotent: skip if already loaded or in-flight
    const { projects, isLoading } = get();
    if (projects.length > 0 || isLoading) return;

    set({ isLoading: true, error: null });
    try {
      const data = await getProjects();
      set({ projects: data, isLoading: false });
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false });
    }
  },
}));
