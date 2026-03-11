'use client';

import { create } from 'zustand';

import type {
  ArtifactContext,
  ArtifactExplorerResult,
  ArtifactFileResult,
  ArtifactPathDeleteResult,
  ArtifactPathRenameResult,
  ProjectFileIndexEntry,
} from '@/lib/client-api';

import {
  deleteArtifactPath,
  getArtifactExplorer,
  getArtifactFile,
  getProjectFileIndex,
  renameArtifactPath,
} from '@/lib/client-api';

const DEFAULT_PROJECT_FILE_INDEX_LIMIT = 10_000;
const DEFAULT_PROJECT_FILE_SEARCH_LIMIT = 50;

type ArtifactNavigationLocation = {
  directoryPath: string;
  filePath: string | null;
};

type ArtifactNavigationHistory = {
  entries: ArtifactNavigationLocation[];
  index: number;
};

type ArtifactFilesStoreState = {
  directoriesByArtifact: Record<string, Record<string, ArtifactExplorerResult>>;
  filesByArtifact: Record<string, Record<string, ArtifactFileResult>>;
  currentDirectoryPathByArtifact: Record<string, string>;
  selectedFileByArtifact: Record<string, string | null>;
  navigationHistoryByArtifact: Record<string, ArtifactNavigationHistory>;
  directoryLoadingByKey: Record<string, boolean>;
  fileLoadingByKey: Record<string, boolean>;
  directoryErrorByKey: Record<string, string | null>;
  fileErrorByKey: Record<string, string | null>;
  projectFileIndexByProject: Record<string, ProjectFileIndexEntry[]>;
  projectFileIndexTruncatedByProject: Record<string, boolean>;
  projectFileIndexLoadingByProject: Record<string, boolean>;
  projectFileIndexErrorByProject: Record<string, string | null>;
  setCurrentDirectory: (ctx: ArtifactContext, path: string) => void;
  setSelectedFile: (ctx: ArtifactContext, path: string | null) => void;
  pushNavigationState: (
    ctx: ArtifactContext,
    input: { directoryPath: string; filePath?: string | null }
  ) => void;
  navigateHistory: (
    ctx: ArtifactContext,
    direction: 'back' | 'forward'
  ) => ArtifactNavigationLocation | null;
  loadDirectory: (
    ctx: ArtifactContext,
    path?: string,
    force?: boolean
  ) => Promise<ArtifactExplorerResult>;
  openFile: (ctx: ArtifactContext, path: string, force?: boolean) => Promise<ArtifactFileResult>;
  clearArtifactCache: (ctx: ArtifactContext) => void;
  loadProjectFileIndex: (projectId: string, force?: boolean) => Promise<ProjectFileIndexEntry[]>;
  searchProjectFiles: (
    projectId: string,
    query: string,
    limit?: number
  ) => Promise<ProjectFileIndexEntry[]>;
  renamePath: (
    ctx: ArtifactContext,
    input: { path: string; newName: string }
  ) => Promise<ArtifactPathRenameResult>;
  deletePath: (ctx: ArtifactContext, input: { path: string }) => Promise<ArtifactPathDeleteResult>;
  clearProjectFileIndex: (projectId: string) => void;
};

function getArtifactKey(ctx: ArtifactContext): string {
  return `${ctx.projectId}::${ctx.artifactId}`;
}

function normalizeRelativePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .trim();
}

function getDirectoryRequestKey(artifactKey: string, path: string): string {
  return `${artifactKey}::dir::${path}`;
}

function getFileRequestKey(artifactKey: string, path: string): string {
  return `${artifactKey}::file::${path}`;
}

function normalizeNavigationLocation(input: {
  directoryPath: string;
  filePath?: string | null;
}): ArtifactNavigationLocation {
  return {
    directoryPath: normalizeRelativePath(input.directoryPath),
    filePath: input.filePath ? normalizeRelativePath(input.filePath) : null,
  };
}

function isSameNavigationLocation(
  left: ArtifactNavigationLocation | undefined,
  right: ArtifactNavigationLocation
): boolean {
  return left?.directoryPath === right.directoryPath && left?.filePath === right.filePath;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected error';
}

function filterProjectFiles(
  entries: ProjectFileIndexEntry[],
  query: string,
  limit: number
): ProjectFileIndexEntry[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return entries.slice(0, limit);
  }

  return entries
    .filter((entry) => {
      const pathMatch = entry.path.toLowerCase().includes(normalizedQuery);
      const artifactPathMatch = entry.artifactPath.toLowerCase().includes(normalizedQuery);
      const artifactNameMatch = entry.artifactName.toLowerCase().includes(normalizedQuery);
      return pathMatch || artifactPathMatch || artifactNameMatch;
    })
    .slice(0, limit);
}

export const useArtifactFilesStore = create<ArtifactFilesStoreState>((set, get) => ({
  directoriesByArtifact: {},
  filesByArtifact: {},
  currentDirectoryPathByArtifact: {},
  selectedFileByArtifact: {},
  navigationHistoryByArtifact: {},
  directoryLoadingByKey: {},
  fileLoadingByKey: {},
  directoryErrorByKey: {},
  fileErrorByKey: {},
  projectFileIndexByProject: {},
  projectFileIndexTruncatedByProject: {},
  projectFileIndexLoadingByProject: {},
  projectFileIndexErrorByProject: {},

  setCurrentDirectory: (ctx, path) => {
    const artifactKey = getArtifactKey(ctx);
    const normalized = normalizeRelativePath(path);
    set((state) => ({
      currentDirectoryPathByArtifact: {
        ...state.currentDirectoryPathByArtifact,
        [artifactKey]: normalized,
      },
    }));
  },

  setSelectedFile: (ctx, path) => {
    const artifactKey = getArtifactKey(ctx);
    const normalized = path ? normalizeRelativePath(path) : null;
    set((state) => ({
      selectedFileByArtifact: {
        ...state.selectedFileByArtifact,
        [artifactKey]: normalized,
      },
    }));
  },

  pushNavigationState: (ctx, input) => {
    const artifactKey = getArtifactKey(ctx);
    const nextLocation = normalizeNavigationLocation(input);

    set((state) => {
      const currentHistory = state.navigationHistoryByArtifact[artifactKey];
      const currentLocation = currentHistory?.entries[currentHistory.index];

      if (isSameNavigationLocation(currentLocation, nextLocation)) {
        return {
          currentDirectoryPathByArtifact: {
            ...state.currentDirectoryPathByArtifact,
            [artifactKey]: nextLocation.directoryPath,
          },
          selectedFileByArtifact: {
            ...state.selectedFileByArtifact,
            [artifactKey]: nextLocation.filePath,
          },
        };
      }

      const nextEntries = currentHistory
        ? [...currentHistory.entries.slice(0, currentHistory.index + 1), nextLocation]
        : [nextLocation];

      return {
        currentDirectoryPathByArtifact: {
          ...state.currentDirectoryPathByArtifact,
          [artifactKey]: nextLocation.directoryPath,
        },
        selectedFileByArtifact: {
          ...state.selectedFileByArtifact,
          [artifactKey]: nextLocation.filePath,
        },
        navigationHistoryByArtifact: {
          ...state.navigationHistoryByArtifact,
          [artifactKey]: {
            entries: nextEntries,
            index: nextEntries.length - 1,
          },
        },
      };
    });
  },

  navigateHistory: (ctx, direction) => {
    const artifactKey = getArtifactKey(ctx);
    const currentHistory = get().navigationHistoryByArtifact[artifactKey];

    if (!currentHistory) {
      return null;
    }

    const nextIndex = direction === 'back' ? currentHistory.index - 1 : currentHistory.index + 1;

    if (nextIndex < 0 || nextIndex >= currentHistory.entries.length) {
      return null;
    }

    const nextLocation = currentHistory.entries[nextIndex];

    set((state) => ({
      currentDirectoryPathByArtifact: {
        ...state.currentDirectoryPathByArtifact,
        [artifactKey]: nextLocation.directoryPath,
      },
      selectedFileByArtifact: {
        ...state.selectedFileByArtifact,
        [artifactKey]: nextLocation.filePath,
      },
      navigationHistoryByArtifact: {
        ...state.navigationHistoryByArtifact,
        [artifactKey]: {
          ...currentHistory,
          index: nextIndex,
        },
      },
    }));

    return nextLocation;
  },

  loadDirectory: async (ctx, path = '', force = false) => {
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
      const listing = await getArtifactExplorer(ctx, safePath);
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
    const artifactKey = getArtifactKey(ctx);
    const safePath = normalizeRelativePath(path);
    if (!safePath) {
      throw new Error('File path is required');
    }

    const requestKey = getFileRequestKey(artifactKey, safePath);
    const cached = get().filesByArtifact[artifactKey]?.[safePath];

    set((state) => ({
      selectedFileByArtifact: {
        ...state.selectedFileByArtifact,
        [artifactKey]: safePath,
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
      const file = await getArtifactFile(ctx, { path: safePath });
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

  clearArtifactCache: (ctx) => {
    const artifactKey = getArtifactKey(ctx);
    set((state) => {
      const nextDirectories = { ...state.directoriesByArtifact };
      const nextFiles = { ...state.filesByArtifact };
      const nextHistory = { ...state.navigationHistoryByArtifact };
      const nextSelected = { ...state.selectedFileByArtifact };

      delete nextDirectories[artifactKey];
      delete nextFiles[artifactKey];
      delete nextHistory[artifactKey];
      delete nextSelected[artifactKey];

      return {
        directoriesByArtifact: nextDirectories,
        filesByArtifact: nextFiles,
        navigationHistoryByArtifact: nextHistory,
        selectedFileByArtifact: nextSelected,
      };
    });
  },

  loadProjectFileIndex: async (projectId, force = false) => {
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
      const result = await getProjectFileIndex(projectId, {
        limit: DEFAULT_PROJECT_FILE_INDEX_LIMIT,
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
    const safeLimit = Math.max(1, Math.min(Math.floor(limit), 1000));
    const cached = get().projectFileIndexByProject[projectId];
    const isTruncated = get().projectFileIndexTruncatedByProject[projectId] ?? false;

    if (cached && (!isTruncated || !query.trim())) {
      return filterProjectFiles(cached, query, safeLimit);
    }

    if (!query.trim()) {
      const fullIndex = await get().loadProjectFileIndex(projectId);
      return filterProjectFiles(fullIndex, query, safeLimit);
    }

    const result = await getProjectFileIndex(projectId, {
      query,
      limit: safeLimit,
    });
    return result.files;
  },

  renamePath: async (ctx, input) => {
    const result = await renameArtifactPath(ctx, input);
    get().clearProjectFileIndex(ctx.projectId);
    return result;
  },

  deletePath: async (ctx, input) => {
    const result = await deleteArtifactPath(ctx, input);
    get().clearProjectFileIndex(ctx.projectId);
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
