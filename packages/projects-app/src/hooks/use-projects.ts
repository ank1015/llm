import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { CreateProjectInput } from '@/lib/types';

import * as api from '@/lib/api';
import { useProjectsStore } from '@/stores/projects-store';

export function useProjects() {
  const setProjects = useProjectsStore((s) => s.setProjects);

  return useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const data = await api.listProjects();
      setProjects(data);
      return data;
    },
  });
}

export function useProject(projectId: string | undefined) {
  return useQuery({
    queryKey: ['projects', projectId],
    queryFn: () => api.getProject(projectId!),
    enabled: !!projectId,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  const addProject = useProjectsStore((s) => s.addProject);

  return useMutation({
    mutationFn: (input: CreateProjectInput) => api.createProject(input),
    onSuccess: (data) => {
      addProject(data);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  const removeProject = useProjectsStore((s) => s.removeProject);

  return useMutation({
    mutationFn: (projectId: string) => api.deleteProject(projectId),
    onSuccess: (_data, projectId) => {
      removeProject(projectId);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}
