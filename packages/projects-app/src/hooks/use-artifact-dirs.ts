import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { CreateArtifactDirInput } from '@/lib/types';

import * as api from '@/lib/api';
import { useArtifactDirsStore } from '@/stores/artifact-dirs-store';

export function useArtifactDirs(projectId: string | undefined) {
  const setArtifactDirs = useArtifactDirsStore((s) => s.setArtifactDirs);

  return useQuery({
    queryKey: ['artifactDirs', projectId],
    queryFn: async () => {
      const data = await api.listArtifactDirs(projectId!);
      setArtifactDirs(data);
      return data;
    },
    enabled: !!projectId,
  });
}

export function useArtifactDir(projectId: string | undefined, artifactDirId: string | undefined) {
  return useQuery({
    queryKey: ['artifactDirs', projectId, artifactDirId],
    queryFn: () => api.getArtifactDir(projectId!, artifactDirId!),
    enabled: !!projectId && !!artifactDirId,
  });
}

export function useCreateArtifactDir(projectId: string) {
  const queryClient = useQueryClient();
  const addArtifactDir = useArtifactDirsStore((s) => s.addArtifactDir);

  return useMutation({
    mutationFn: (input: CreateArtifactDirInput) => api.createArtifactDir(projectId, input),
    onSuccess: (data) => {
      addArtifactDir(data);
      queryClient.invalidateQueries({ queryKey: ['artifactDirs', projectId] });
    },
  });
}

export function useDeleteArtifactDir(projectId: string) {
  const queryClient = useQueryClient();
  const removeArtifactDir = useArtifactDirsStore((s) => s.removeArtifactDir);

  return useMutation({
    mutationFn: (artifactDirId: string) => api.deleteArtifactDir(projectId, artifactDirId),
    onSuccess: (_data, artifactDirId) => {
      removeArtifactDir(artifactDirId);
      queryClient.invalidateQueries({ queryKey: ['artifactDirs', projectId] });
    },
  });
}
