"use client";

import { create } from "zustand";

import {
  deleteArtifactPath,
  getArtifactExplorer,
  getArtifactFile,
  getProjectFileIndex,
  renameArtifactPath,
  updateArtifactFile,
} from "@/lib/client-api";
import { getBrowserQueryClient } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";

import type {
  ArtifactContext,
  ArtifactExplorerResult,
  ArtifactFileDto,
  DeleteArtifactPathResponse,
  ProjectFileIndexEntryDto,
  RenameArtifactPathResponse,
} from "@/lib/client-api";

const DEFAULT_PROJECT_FILE_INDEX_LIMIT = 10_000;
const DEFAULT_PROJECT_FILE_SEARCH_LIMIT = 50;

export type ArtifactPreviewMode = "file" | "diff" | null;

type ArtifactFilesStoreState = {
  directoriesByArtifact: Record<string, Record<string, ArtifactExplorerResult>>;
  filesByArtifact: Record<string, Record<string, ArtifactFileDto>>;
  selectedFileByArtifact: Record<string, string | null>;
  previewModeByArtifact: Record<string, ArtifactPreviewMode>;
  selectedDiffFileByArtifact: Record<string, string | null>;
  directoryLoadingByKey: Record<string, boolean>;
  fileLoadingByKey: Record<string, boolean>;
  directoryErrorByKey: Record<string, string | null>;
  fileErrorByKey: Record<string, string | null>;
  projectFileIndexByProject: Record<string, ProjectFileIndexEntryDto[]>;
  projectFileIndexTruncatedByProject: Record<string, boolean>;
  projectFileIndexLoadingByProject: Record<string, boolean>;
  projectFileIndexErrorByProject: Record<string, string | null>;
  setSelectedFile: (ctx: ArtifactContext, path: string | null) => void;
  setSelectedDiffFile: (ctx: ArtifactContext, path: string | null) => void;
  openDiffPreview: (ctx: ArtifactContext, path?: string | null) => void;
  closePreview: (ctx: ArtifactContext) => void;
  loadDirectory: (
    ctx: ArtifactContext,
    path?: string,
    force?: boolean,
  ) => Promise<ArtifactExplorerResult>;
  openFile: (ctx: ArtifactContext, path: string, force?: boolean) => Promise<ArtifactFileDto>;
  saveFile: (
    ctx: ArtifactContext,
    input: { path: string; content: string },
  ) => Promise<ArtifactFileDto>;
  clearArtifactCache: (ctx: ArtifactContext) => void;
  loadProjectFileIndex: (projectId: string, force?: boolean) => Promise<ProjectFileIndexEntryDto[]>;
  searchProjectFiles: (
    projectId: string,
    query: string,
    limit?: number,
  ) => Promise<ProjectFileIndexEntryDto[]>;
  renamePath: (
    ctx: ArtifactContext,
    input: { path: string; newName: string },
  ) => Promise<RenameArtifactPathResponse>;
  deletePath: (
    ctx: ArtifactContext,
    input: { path: string },
  ) => Promise<DeleteArtifactPathResponse>;
  clearProjectFileIndex: (projectId: string) => void;
};

function getArtifactKey(ctx: ArtifactContext): string {
  return `${ctx.projectId}::${ctx.artifactId}`;
}

function normalizeRelativePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").trim();
}

function getDirectoryRequestKey(artifactKey: string, path: string): string {
  return `${artifactKey}::dir::${path}`;
}

function getFileRequestKey(artifactKey: string, path: string): string {
  return `${artifactKey}::file::${path}`;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}

export const useArtifactFilesStore = create<ArtifactFilesStoreState>((set, get) => ({
  directoriesByArtifact: {},
  filesByArtifact: {},
  selectedFileByArtifact: {},
  previewModeByArtifact: {},
  selectedDiffFileByArtifact: {},
  directoryLoadingByKey: {},
  fileLoadingByKey: {},
  directoryErrorByKey: {},
  fileErrorByKey: {},
  projectFileIndexByProject: {},
  projectFileIndexTruncatedByProject: {},
  projectFileIndexLoadingByProject: {},
  projectFileIndexErrorByProject: {},

  setSelectedFile: (ctx, path) => {
    const artifactKey = getArtifactKey(ctx);
    const normalized = path ? normalizeRelativePath(path) : null;
    set((state) => ({
      selectedFileByArtifact: {
        ...state.selectedFileByArtifact,
        [artifactKey]: normalized,
      },
      previewModeByArtifact: {
        ...state.previewModeByArtifact,
        [artifactKey]: normalized ? "file" : null,
      },
    }));
  },

  setSelectedDiffFile: (ctx, path) => {
    const artifactKey = getArtifactKey(ctx);
    const normalized = path ? normalizeRelativePath(path) : null;
    set((state) => ({
      selectedDiffFileByArtifact: {
        ...state.selectedDiffFileByArtifact,
        [artifactKey]: normalized,
      },
    }));
  },

  openDiffPreview: (ctx, path) => {
    const artifactKey = getArtifactKey(ctx);
    const normalized = path ? normalizeRelativePath(path) : null;
    set((state) => ({
      previewModeByArtifact: {
        ...state.previewModeByArtifact,
        [artifactKey]: "diff",
      },
      selectedDiffFileByArtifact: {
        ...state.selectedDiffFileByArtifact,
        [artifactKey]:
          normalized ?? state.selectedDiffFileByArtifact[artifactKey] ?? null,
      },
    }));
  },

  closePreview: (ctx) => {
    const artifactKey = getArtifactKey(ctx);
    set((state) => ({
      selectedFileByArtifact: {
        ...state.selectedFileByArtifact,
        [artifactKey]: null,
      },
      selectedDiffFileByArtifact: {
        ...state.selectedDiffFileByArtifact,
        [artifactKey]: null,
      },
      previewModeByArtifact: {
        ...state.previewModeByArtifact,
        [artifactKey]: null,
      },
    }));
  },

  loadDirectory: async (ctx, path = "", force = false) => {
    const queryClient = getBrowserQueryClient();
    const artifactKey = getArtifactKey(ctx);
    const safePath = normalizeRelativePath(path);
    const requestKey = getDirectoryRequestKey(artifactKey, safePath);
    const cached = get().directoriesByArtifact[artifactKey]?.[safePath];

    if (cached && !force) {
      return cached;
    }

    set((state) => ({
      directoryLoadingByKey: {
        ...state.directoryLoadingByKey,
        [requestKey]: true,
      },
      directoryErrorByKey: {
        ...state.directoryErrorByKey,
        [requestKey]: null,
      },
    }));

    try {
      if (force) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.artifacts.explorer(ctx, safePath),
        });
      }

      const listing = await queryClient.fetchQuery({
        queryKey: queryKeys.artifacts.explorer(ctx, safePath),
        queryFn: () => getArtifactExplorer(ctx, safePath),
      });
      const listingPath = normalizeRelativePath(listing.path);

      set((state) => ({
        directoriesByArtifact: {
          ...state.directoriesByArtifact,
          [artifactKey]: {
            ...(state.directoriesByArtifact[artifactKey] ?? {}),
            [listingPath]: {
              ...listing,
              path: listingPath,
            },
          },
        },
        directoryLoadingByKey: {
          ...state.directoryLoadingByKey,
          [requestKey]: false,
        },
      }));

      return {
        ...listing,
        path: listingPath,
      };
    } catch (error) {
      const message = toErrorMessage(error);
      set((state) => ({
        directoryLoadingByKey: {
          ...state.directoryLoadingByKey,
          [requestKey]: false,
        },
        directoryErrorByKey: {
          ...state.directoryErrorByKey,
          [requestKey]: message,
        },
      }));
      throw error;
    }
  },

  openFile: async (ctx, path, force = false) => {
    const queryClient = getBrowserQueryClient();
    const artifactKey = getArtifactKey(ctx);
    const safePath = normalizeRelativePath(path);
    if (!safePath) {
      throw new Error("File path is required");
    }

    const requestKey = getFileRequestKey(artifactKey, safePath);
    const cached = get().filesByArtifact[artifactKey]?.[safePath];

    set((state) => ({
      selectedFileByArtifact: {
        ...state.selectedFileByArtifact,
        [artifactKey]: safePath,
      },
      previewModeByArtifact: {
        ...state.previewModeByArtifact,
        [artifactKey]: "file",
      },
    }));

    if (cached && !force) {
      return cached;
    }

    set((state) => ({
      fileLoadingByKey: {
        ...state.fileLoadingByKey,
        [requestKey]: true,
      },
      fileErrorByKey: {
        ...state.fileErrorByKey,
        [requestKey]: null,
      },
    }));

    try {
      if (force) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.artifacts.file(ctx, { path: safePath }),
        });
      }

      const file = await queryClient.fetchQuery({
        queryKey: queryKeys.artifacts.file(ctx, { path: safePath }),
        queryFn: () => getArtifactFile(ctx, { path: safePath }),
      });
      const filePath = normalizeRelativePath(file.path);

      set((state) => ({
        filesByArtifact: {
          ...state.filesByArtifact,
          [artifactKey]: {
            ...(state.filesByArtifact[artifactKey] ?? {}),
            [filePath]: {
              ...file,
              path: filePath,
            },
          },
        },
        selectedFileByArtifact: {
          ...state.selectedFileByArtifact,
          [artifactKey]: filePath,
        },
        previewModeByArtifact: {
          ...state.previewModeByArtifact,
          [artifactKey]: "file",
        },
        fileLoadingByKey: {
          ...state.fileLoadingByKey,
          [requestKey]: false,
        },
      }));

      return {
        ...file,
        path: filePath,
      };
    } catch (error) {
      const message = toErrorMessage(error);
      set((state) => ({
        fileLoadingByKey: {
          ...state.fileLoadingByKey,
          [requestKey]: false,
        },
        fileErrorByKey: {
          ...state.fileErrorByKey,
          [requestKey]: message,
        },
      }));
      throw error;
    }
  },

  saveFile: async (ctx, input) => {
    const queryClient = getBrowserQueryClient();
    const artifactKey = getArtifactKey(ctx);
    const safePath = normalizeRelativePath(input.path);
    if (!safePath) {
      throw new Error("File path is required");
    }

    const updatedFile = await updateArtifactFile(ctx, {
      path: safePath,
      content: input.content,
    });
    const normalizedFile = {
      ...updatedFile,
      path: normalizeRelativePath(updatedFile.path),
    };

    queryClient.setQueryData(queryKeys.artifacts.file(ctx, { path: safePath }), normalizedFile);

    set((state) => ({
      filesByArtifact: {
        ...state.filesByArtifact,
        [artifactKey]: {
          ...(state.filesByArtifact[artifactKey] ?? {}),
          [normalizedFile.path]: normalizedFile,
        },
      },
      selectedFileByArtifact: {
        ...state.selectedFileByArtifact,
        [artifactKey]: normalizedFile.path,
      },
      previewModeByArtifact: {
        ...state.previewModeByArtifact,
        [artifactKey]: "file",
      },
      fileErrorByKey: {
        ...state.fileErrorByKey,
        [getFileRequestKey(artifactKey, normalizedFile.path)]: null,
      },
    }));

    get().clearProjectFileIndex(ctx.projectId);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.artifacts.files(ctx) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.artifacts.checkpointDiff(ctx) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.artifacts.scope(ctx) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.fileIndexRoot(ctx.projectId) }),
    ]);

    return normalizedFile;
  },

  clearArtifactCache: (ctx) => {
    const artifactKey = getArtifactKey(ctx);
    set((state) => {
      const nextDirectories = { ...state.directoriesByArtifact };
      const nextFiles = { ...state.filesByArtifact };
      const nextSelected = { ...state.selectedFileByArtifact };
      const nextPreviewModes = { ...state.previewModeByArtifact };
      const nextSelectedDiff = { ...state.selectedDiffFileByArtifact };

      delete nextDirectories[artifactKey];
      delete nextFiles[artifactKey];
      delete nextSelected[artifactKey];
      delete nextPreviewModes[artifactKey];
      delete nextSelectedDiff[artifactKey];

      return {
        directoriesByArtifact: nextDirectories,
        filesByArtifact: nextFiles,
        selectedFileByArtifact: nextSelected,
        previewModeByArtifact: nextPreviewModes,
        selectedDiffFileByArtifact: nextSelectedDiff,
      };
    });
  },

  loadProjectFileIndex: async (projectId, force = false) => {
    const queryClient = getBrowserQueryClient();
    const cached = get().projectFileIndexByProject[projectId];
    if (cached && !force) {
      return cached;
    }

    set((state) => ({
      projectFileIndexLoadingByProject: {
        ...state.projectFileIndexLoadingByProject,
        [projectId]: true,
      },
      projectFileIndexErrorByProject: {
        ...state.projectFileIndexErrorByProject,
        [projectId]: null,
      },
    }));

    try {
      const queryKey = queryKeys.projects.fileIndex(projectId, {
        limit: DEFAULT_PROJECT_FILE_INDEX_LIMIT,
      });
      if (force) {
        await queryClient.invalidateQueries({ queryKey });
      }

      const result = await queryClient.fetchQuery({
        queryKey,
        queryFn: () =>
          getProjectFileIndex(projectId, {
            limit: DEFAULT_PROJECT_FILE_INDEX_LIMIT,
          }),
      });

      set((state) => ({
        projectFileIndexByProject: {
          ...state.projectFileIndexByProject,
          [projectId]: result.files,
        },
        projectFileIndexTruncatedByProject: {
          ...state.projectFileIndexTruncatedByProject,
          [projectId]: result.truncated,
        },
        projectFileIndexLoadingByProject: {
          ...state.projectFileIndexLoadingByProject,
          [projectId]: false,
        },
      }));

      return result.files;
    } catch (error) {
      const message = toErrorMessage(error);
      set((state) => ({
        projectFileIndexLoadingByProject: {
          ...state.projectFileIndexLoadingByProject,
          [projectId]: false,
        },
        projectFileIndexErrorByProject: {
          ...state.projectFileIndexErrorByProject,
          [projectId]: message,
        },
      }));
      throw error;
    }
  },

  searchProjectFiles: async (projectId, query, limit = DEFAULT_PROJECT_FILE_SEARCH_LIMIT) => {
    const queryClient = getBrowserQueryClient();
    const safeLimit = Math.max(1, Math.min(Math.floor(limit), 1000));
    const queryKey = queryKeys.projects.fileIndex(projectId, {
      query,
      limit: safeLimit,
    });

    await queryClient.invalidateQueries({ queryKey });
    const result = await queryClient.fetchQuery({
      queryKey,
      queryFn: () =>
        getProjectFileIndex(projectId, {
          query,
          limit: safeLimit,
        }),
    });

    return result.files;
  },

  renamePath: async (ctx, input) => {
    const queryClient = getBrowserQueryClient();
    const result = await renameArtifactPath(ctx, input);
    get().clearArtifactCache(ctx);
    get().clearProjectFileIndex(ctx.projectId);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.artifacts.checkpointDiff(ctx) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.artifacts.scope(ctx) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.overview(ctx.projectId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.fileIndexRoot(ctx.projectId) }),
    ]);
    return result;
  },

  deletePath: async (ctx, input) => {
    const queryClient = getBrowserQueryClient();
    const result = await deleteArtifactPath(ctx, input);
    get().clearArtifactCache(ctx);
    get().clearProjectFileIndex(ctx.projectId);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.artifacts.checkpointDiff(ctx) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.artifacts.scope(ctx) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.overview(ctx.projectId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.fileIndexRoot(ctx.projectId) }),
    ]);
    return result;
  },

  clearProjectFileIndex: (projectId) => {
    set((state) => {
      const nextIndex = { ...state.projectFileIndexByProject };
      const nextTruncated = { ...state.projectFileIndexTruncatedByProject };
      const nextLoading = { ...state.projectFileIndexLoadingByProject };
      const nextError = { ...state.projectFileIndexErrorByProject };

      delete nextIndex[projectId];
      delete nextTruncated[projectId];
      delete nextLoading[projectId];
      delete nextError[projectId];

      return {
        projectFileIndexByProject: nextIndex,
        projectFileIndexTruncatedByProject: nextTruncated,
        projectFileIndexLoadingByProject: nextLoading,
        projectFileIndexErrorByProject: nextError,
      };
    });
  },
}));
