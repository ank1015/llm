'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { invalidateQueryKeys } from './utils';

import type {
  ArtifactContext,
  CreateArtifactDirInput,
  CreateProjectInput,
  InstallArtifactSkillInput,
  ProjectFileIndexInput,
  RenameArtifactDirInput,
  RenameArtifactPathInput,
  RenameProjectInput,
  UpdateProjectImageInput,
  UpdateArtifactFileInput,
} from '@/lib/client-api';

import {
  createArtifactCheckpoint,
  createArtifactDir,
  createProject,
  deleteArtifactSkill,
  deleteArtifactDir,
  deleteArtifactPath,
  deleteProject,
  getArtifactCheckpointDiff,
  getArtifactCheckpoints,
  getArtifactDir,
  getArtifactExplorer,
  getArtifactFile,
  getArtifactFiles,
  getProject,
  getProjectFileIndex,
  getProjectOverview,
  installArtifactSkill,
  listArtifactDirs,
  listInstalledArtifactSkills,
  listProjects,
  listRegisteredSkills,
  reloadArtifactSkill,
  renameArtifactDir,
  renameArtifactPath,
  rollbackArtifactCheckpoint,
  renameProject,
  toggleProjectArchive,
  updateArtifactFile,
  updateProjectImage,
} from '@/lib/client-api';
import { queryKeys } from '@/lib/query-keys';



export function useProjectsQuery() {
  return useQuery({
    queryKey: queryKeys.projects.list(),
    queryFn: listProjects,
  });
}

export function useProjectQuery(projectId: string) {
  return useQuery({
    queryKey: queryKeys.projects.detail(projectId),
    queryFn: () => getProject(projectId),
  });
}

export function useProjectOverviewQuery(projectId: string) {
  return useQuery({
    queryKey: queryKeys.projects.overview(projectId),
    queryFn: () => getProjectOverview(projectId),
  });
}

export function useProjectFileIndexQuery(projectId: string, input?: ProjectFileIndexInput) {
  return useQuery({
    queryKey: queryKeys.projects.fileIndex(projectId, input),
    queryFn: () => getProjectFileIndex(projectId, input),
  });
}

export function useArtifactDirsQuery(projectId: string) {
  return useQuery({
    queryKey: queryKeys.artifacts.list(projectId),
    queryFn: () => listArtifactDirs(projectId),
  });
}

export function useRegisteredSkillsQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.skills.list(),
    queryFn: listRegisteredSkills,
    enabled: options?.enabled ?? true,
  });
}

export function useArtifactDirQuery(ctx: ArtifactContext) {
  return useQuery({
    queryKey: queryKeys.artifacts.detail(ctx),
    queryFn: () => getArtifactDir(ctx),
  });
}

export function useInstalledArtifactSkillsQuery(
  ctx: ArtifactContext,
  options?: {
    enabled?: boolean;
  }
) {
  return useQuery({
    queryKey: queryKeys.artifacts.skills(ctx),
    queryFn: () => listInstalledArtifactSkills(ctx),
    enabled: options?.enabled ?? true,
  });
}

export function useArtifactFilesQuery(ctx: ArtifactContext) {
  return useQuery({
    queryKey: queryKeys.artifacts.files(ctx),
    queryFn: () => getArtifactFiles(ctx),
  });
}

export function useArtifactCheckpointsQuery(ctx: ArtifactContext) {
  return useQuery({
    queryKey: queryKeys.artifacts.checkpoints(ctx),
    queryFn: () => getArtifactCheckpoints(ctx),
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.checkpoints.some((checkpoint) => checkpoint.summaryStatus === 'pending')
        ? 4_000
        : false;
    },
  });
}

export function useArtifactCheckpointDiffQuery(
  ctx: ArtifactContext,
  options?: {
    enabled?: boolean;
  }
) {
  return useQuery({
    queryKey: queryKeys.artifacts.checkpointDiff(ctx),
    queryFn: () => getArtifactCheckpointDiff(ctx),
    enabled: options?.enabled ?? true,
  });
}

export function useArtifactExplorerQuery(ctx: ArtifactContext, path = '') {
  return useQuery({
    queryKey: queryKeys.artifacts.explorer(ctx, path),
    queryFn: () => getArtifactExplorer(ctx, path),
  });
}

export function useArtifactFileQuery(
  ctx: ArtifactContext,
  input: {
    path: string;
    maxBytes?: number;
  }
) {
  return useQuery({
    queryKey: queryKeys.artifacts.file(ctx, input),
    queryFn: () => getArtifactFile(ctx, input),
  });
}

export function useCreateProjectMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateProjectInput) => createProject(input),
    onSuccess: async () => {
      await invalidateQueryKeys(queryClient, [queryKeys.projects.list()]);
    },
  });
}

export function useRenameProjectMutation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: RenameProjectInput) => renameProject(projectId, input),
    onSuccess: async () => {
      await invalidateQueryKeys(queryClient, [
        queryKeys.projects.list(),
        queryKeys.projects.detail(projectId),
        queryKeys.projects.overview(projectId),
        queryKeys.projects.fileIndexRoot(projectId),
      ]);
    },
  });
}

export function useUpdateProjectImageMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateProjectImageInput) => updateProjectImage(input),
    onSuccess: async (project) => {
      await invalidateQueryKeys(queryClient, [
        queryKeys.projects.list(),
        queryKeys.projects.detail(project.id),
        queryKeys.projects.overview(project.id),
        queryKeys.projects.fileIndexRoot(project.id),
      ]);
    },
  });
}

export function useDeleteProjectMutation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => deleteProject(projectId),
    onSuccess: async () => {
      await invalidateQueryKeys(queryClient, [
        queryKeys.projects.list(),
        queryKeys.projects.detail(projectId),
        queryKeys.projects.overview(projectId),
        queryKeys.projects.fileIndexRoot(projectId),
      ]);
    },
  });
}

export function useToggleProjectArchiveMutation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => toggleProjectArchive(projectId),
    onSuccess: async () => {
      await invalidateQueryKeys(queryClient, [
        queryKeys.projects.list(),
        queryKeys.projects.detail(projectId),
        queryKeys.projects.overview(projectId),
        queryKeys.projects.fileIndexRoot(projectId),
      ]);
    },
  });
}

export function useCreateArtifactDirMutation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateArtifactDirInput) => createArtifactDir(projectId, input),
    onSuccess: async () => {
      await invalidateQueryKeys(queryClient, [
        queryKeys.artifacts.list(projectId),
        queryKeys.projects.overview(projectId),
        queryKeys.projects.fileIndexRoot(projectId),
      ]);
    },
  });
}

export function useRenameArtifactDirMutation(ctx: ArtifactContext) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: RenameArtifactDirInput) =>
      renameArtifactDir(ctx.projectId, ctx.artifactId, input),
    onSuccess: async () => {
      await invalidateQueryKeys(queryClient, [
        queryKeys.artifacts.list(ctx.projectId),
        queryKeys.artifacts.scope(ctx),
        queryKeys.projects.overview(ctx.projectId),
        queryKeys.projects.fileIndexRoot(ctx.projectId),
      ]);
    },
  });
}

export function useDeleteArtifactDirMutation(ctx: ArtifactContext) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => deleteArtifactDir(ctx.projectId, ctx.artifactId),
    onSuccess: async () => {
      await invalidateQueryKeys(queryClient, [
        queryKeys.artifacts.list(ctx.projectId),
        queryKeys.artifacts.scope(ctx),
        queryKeys.projects.overview(ctx.projectId),
        queryKeys.projects.fileIndexRoot(ctx.projectId),
      ]);
    },
  });
}

export function useInstallArtifactSkillMutation(ctx: ArtifactContext) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: InstallArtifactSkillInput) => installArtifactSkill(ctx, input),
    onSuccess: async () => {
      await invalidateQueryKeys(queryClient, [queryKeys.artifacts.skills(ctx)]);
    },
  });
}

export function useReloadArtifactSkillMutation(ctx: ArtifactContext) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (skillName: string) => reloadArtifactSkill(ctx, skillName),
    onSuccess: async () => {
      await invalidateQueryKeys(queryClient, [queryKeys.artifacts.skills(ctx)]);
    },
  });
}

export function useDeleteArtifactSkillMutation(ctx: ArtifactContext) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (skillName: string) => deleteArtifactSkill(ctx, skillName),
    onSuccess: async () => {
      await invalidateQueryKeys(queryClient, [queryKeys.artifacts.skills(ctx)]);
    },
  });
}

export function useCreateArtifactCheckpointMutation(ctx: ArtifactContext) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => createArtifactCheckpoint(ctx),
    onSuccess: async () => {
      await invalidateQueryKeys(queryClient, [
        queryKeys.artifacts.checkpoints(ctx),
        queryKeys.artifacts.checkpointDiff(ctx),
      ]);
    },
  });
}

export function useRollbackArtifactCheckpointMutation(ctx: ArtifactContext) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => rollbackArtifactCheckpoint(ctx),
    onSuccess: async () => {
      await invalidateQueryKeys(queryClient, [
        queryKeys.artifacts.checkpoints(ctx),
        queryKeys.artifacts.checkpointDiff(ctx),
        queryKeys.artifacts.files(ctx),
        queryKeys.artifacts.scope(ctx),
        queryKeys.projects.fileIndexRoot(ctx.projectId),
      ]);
    },
  });
}

export function useUpdateArtifactFileMutation(ctx: ArtifactContext) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateArtifactFileInput) => updateArtifactFile(ctx, input),
    onSuccess: async (_file, input) => {
      await invalidateQueryKeys(queryClient, [
        queryKeys.artifacts.file(ctx, { path: input.path }),
        queryKeys.artifacts.files(ctx),
        queryKeys.artifacts.scope(ctx),
        queryKeys.projects.fileIndexRoot(ctx.projectId),
      ]);
    },
  });
}

export function useRenameArtifactPathMutation(ctx: ArtifactContext) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: RenameArtifactPathInput) => renameArtifactPath(ctx, input),
    onSuccess: async () => {
      await invalidateQueryKeys(queryClient, [
        queryKeys.artifacts.scope(ctx),
        queryKeys.projects.overview(ctx.projectId),
        queryKeys.projects.fileIndexRoot(ctx.projectId),
      ]);
    },
  });
}

export function useDeleteArtifactPathMutation(ctx: ArtifactContext) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { path: string }) => deleteArtifactPath(ctx, input),
    onSuccess: async () => {
      await invalidateQueryKeys(queryClient, [
        queryKeys.artifacts.scope(ctx),
        queryKeys.projects.overview(ctx.projectId),
        queryKeys.projects.fileIndexRoot(ctx.projectId),
      ]);
    },
  });
}
