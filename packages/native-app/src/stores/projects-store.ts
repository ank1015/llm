'use client';

import { create } from 'zustand';

import {
  createProject as createProjectApi,
  deleteProject as deleteProjectApi,
  listProjects,
  type ProjectMetadata,
} from '@/lib/client-api';

type CreateProjectInput = {
  name: string;
  description?: string;
};

type ProjectsStoreState = {
  projects: ProjectMetadata[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  isCreating: boolean;
  deletingProjectId: string | null;
  mutationError: string | null;
  clearMutationError: () => void;
  fetchProjects: () => Promise<void>;
  refresh: () => Promise<void>;
  createProject: (input: CreateProjectInput) => Promise<ProjectMetadata>;
  deleteProject: (projectId: string) => Promise<void>;
  reset: () => void;
};

let latestRequestId = 0;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Unknown error while loading projects.';
}

const initialState = {
  projects: [] as ProjectMetadata[],
  isLoading: false,
  isRefreshing: false,
  error: null as string | null,
  isCreating: false,
  deletingProjectId: null as string | null,
  mutationError: null as string | null,
};

export const useProjectsStore = create<ProjectsStoreState>((set, get) => ({
  ...initialState,

  clearMutationError: () => {
    set({ mutationError: null });
  },

  fetchProjects: async () => {
    const requestId = ++latestRequestId;

    set({
      isLoading: true,
      isRefreshing: false,
      error: null,
    });

    try {
      const projects = await listProjects();

      if (requestId !== latestRequestId) {
        return;
      }

      set({
        projects,
        error: null,
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

  refresh: async () => {
    const requestId = ++latestRequestId;

    set({
      isRefreshing: true,
      error: null,
    });

    try {
      const projects = await listProjects();

      if (requestId !== latestRequestId) {
        return;
      }

      set({
        projects,
        error: null,
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

  createProject: async (input) => {
    const name = input.name.trim();
    const description = input.description?.trim();

    if (name.length === 0) {
      throw new Error('Project name cannot be empty.');
    }

    set({
      isCreating: true,
      mutationError: null,
    });

    try {
      const project = await createProjectApi({
        name,
        description: description?.length ? description : undefined,
      });

      set((state) => ({
        projects: [project, ...state.projects],
      }));

      return project;
    } catch (error) {
      const message = getErrorMessage(error);
      set({ mutationError: message });
      throw error;
    } finally {
      set({ isCreating: false });
    }
  },

  deleteProject: async (projectId) => {
    const previousProjects = get().projects;

    set({
      deletingProjectId: projectId,
      mutationError: null,
      projects: previousProjects.filter((project) => project.id !== projectId),
    });

    try {
      await deleteProjectApi(projectId);
    } catch (error) {
      set({
        projects: previousProjects,
        mutationError: getErrorMessage(error),
      });
      throw error;
    } finally {
      set({
        deletingProjectId: null,
      });
    }
  },

  reset: () => {
    set(initialState);
  },
}));
