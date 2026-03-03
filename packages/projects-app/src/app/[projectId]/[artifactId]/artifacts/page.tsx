'use client';

import {
  ChevronRight,
  Ellipsis,
  FileText,
  Folder,
  FolderOpen,
  Loader2,
  Pencil,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { ArtifactExplorerResult, ArtifactFileResult } from '@/lib/client-api';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useArtifactFilesStore, useSidebarStore, useUiStore } from '@/stores';

const EMPTY_DIRECTORY_MAP: Record<string, ArtifactExplorerResult> = {};
const EMPTY_FILE_MAP: Record<string, ArtifactFileResult> = {};
const EMPTY_LOADING_MAP: Record<string, boolean> = {};
const EMPTY_ERROR_MAP: Record<string, string | null> = {};
const ROOT_EXPANDED: Record<string, boolean> = { '': true };

type ExplorerEntryTarget = {
  path: string;
  name: string;
  type: 'file' | 'directory';
};

function normalizeRelativePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .trim();
}

function getArtifactKey(projectId: string, artifactId: string): string {
  return `${projectId}::${artifactId}`;
}

function getDirectoryRequestKey(artifactKey: string, path: string): string {
  return `${artifactKey}::dir::${path}`;
}

function getFileRequestKey(artifactKey: string, path: string): string {
  return `${artifactKey}::file::${path}`;
}

function isSameOrChildPath(path: string, basePath: string): boolean {
  const safePath = normalizeRelativePath(path);
  const safeBase = normalizeRelativePath(basePath);
  if (!safePath || !safeBase) return false;
  return safePath === safeBase || safePath.startsWith(`${safeBase}/`);
}

function replacePathPrefix(path: string, oldPath: string, newPath: string): string {
  if (!isSameOrChildPath(path, oldPath)) {
    return normalizeRelativePath(path);
  }

  const safePath = normalizeRelativePath(path);
  const safeOldPath = normalizeRelativePath(oldPath);
  const safeNewPath = normalizeRelativePath(newPath);
  if (safePath === safeOldPath) {
    return safeNewPath;
  }

  const suffix = safePath.slice(safeOldPath.length);
  return `${safeNewPath}${suffix}`;
}

function dropExpandedPath(
  expandedDirs: Record<string, boolean>,
  removedPath: string
): Record<string, boolean> {
  const next: Record<string, boolean> = { '': true };
  const safeRemoved = normalizeRelativePath(removedPath);

  for (const [path, expanded] of Object.entries(expandedDirs)) {
    if (path === '') continue;
    if (safeRemoved && isSameOrChildPath(path, safeRemoved)) {
      continue;
    }
    next[path] = expanded;
  }

  return next;
}

function renameExpandedPath(
  expandedDirs: Record<string, boolean>,
  oldPath: string,
  newPath: string
): Record<string, boolean> {
  const next: Record<string, boolean> = { '': true };
  const safeOldPath = normalizeRelativePath(oldPath);
  const safeNewPath = normalizeRelativePath(newPath);

  for (const [path, expanded] of Object.entries(expandedDirs)) {
    if (path === '') continue;
    if (!safeOldPath || !isSameOrChildPath(path, safeOldPath)) {
      next[path] = expanded;
      continue;
    }

    const renamedPath = replacePathPrefix(path, safeOldPath, safeNewPath);
    next[renamedPath] = expanded;
  }

  return next;
}

export default function ArtifactFilesPage() {
  const { projectId, artifactId } = useParams<{ projectId: string; artifactId: string }>();
  const artifactCtx = useMemo(() => ({ projectId, artifactId }), [projectId, artifactId]);
  const artifactKey = useMemo(() => getArtifactKey(projectId, artifactId), [projectId, artifactId]);
  const containerRef = useRef<HTMLDivElement>(null);

  const artifact = useSidebarStore(
    (state) => state.artifactDirs.find((dir) => dir.id === artifactId) ?? null
  );
  const setSidebarCollapsed = useUiStore((state) => state.setSidebarCollapsed);

  const directories = useArtifactFilesStore(
    (state) => state.directoriesByArtifact[artifactKey] ?? EMPTY_DIRECTORY_MAP
  );
  const files = useArtifactFilesStore(
    (state) => state.filesByArtifact[artifactKey] ?? EMPTY_FILE_MAP
  );
  const selectedFilePath = useArtifactFilesStore(
    (state) => state.selectedFileByArtifact[artifactKey] ?? null
  );
  const directoryLoadingByKey = useArtifactFilesStore(
    (state) => state.directoryLoadingByKey ?? EMPTY_LOADING_MAP
  );
  const fileLoadingByKey = useArtifactFilesStore(
    (state) => state.fileLoadingByKey ?? EMPTY_LOADING_MAP
  );
  const directoryErrorByKey = useArtifactFilesStore(
    (state) => state.directoryErrorByKey ?? EMPTY_ERROR_MAP
  );
  const fileErrorByKey = useArtifactFilesStore((state) => state.fileErrorByKey ?? EMPTY_ERROR_MAP);
  const loadDirectory = useArtifactFilesStore((state) => state.loadDirectory);
  const openFile = useArtifactFilesStore((state) => state.openFile);
  const setSelectedFile = useArtifactFilesStore((state) => state.setSelectedFile);
  const clearArtifactCache = useArtifactFilesStore((state) => state.clearArtifactCache);
  const renamePath = useArtifactFilesStore((state) => state.renamePath);
  const deletePath = useArtifactFilesStore((state) => state.deletePath);

  const [expandedDirsByArtifact, setExpandedDirsByArtifact] = useState<
    Record<string, Record<string, boolean>>
  >({});
  const [explorerWidthPx, setExplorerWidthPx] = useState(320);
  const [isResizing, setIsResizing] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ExplorerEntryTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ExplorerEntryTarget | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [isPathMutationPending, setIsPathMutationPending] = useState(false);
  const [pathActionError, setPathActionError] = useState<string | null>(null);
  const expandedDirs = expandedDirsByArtifact[artifactKey] ?? ROOT_EXPANDED;

  useEffect(() => {
    setSidebarCollapsed(true);
    clearArtifactCache(artifactCtx);
    setSelectedFile(artifactCtx, null);
    void loadDirectory(artifactCtx, '', true);
  }, [artifactCtx, clearArtifactCache, loadDirectory, setSelectedFile, setSidebarCollapsed]);

  useEffect(() => {
    if (!isResizing) return;

    const onMouseMove = (event: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const minWidth = 220;
      const maxWidth = Math.max(minWidth, Math.floor(rect.width * 0.7));
      const next = Math.min(maxWidth, Math.max(minWidth, event.clientX - rect.left));
      setExplorerWidthPx(next);
    };

    const onMouseUp = () => setIsResizing(false);

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isResizing]);

  const rootRequestKey = getDirectoryRequestKey(artifactKey, '');
  const isRootLoading = directoryLoadingByKey[rootRequestKey] ?? false;
  const rootError = directoryErrorByKey[rootRequestKey] ?? null;

  const selectedFile = selectedFilePath ? files[selectedFilePath] : null;
  const selectedFileRequestKey = selectedFilePath
    ? getFileRequestKey(artifactKey, selectedFilePath)
    : null;
  const isSelectedFileLoading = selectedFileRequestKey
    ? (fileLoadingByKey[selectedFileRequestKey] ?? false)
    : false;
  const selectedFileError = selectedFileRequestKey
    ? (fileErrorByKey[selectedFileRequestKey] ?? null)
    : null;

  const reloadExplorerState = async (
    nextExpandedDirs: Record<string, boolean>,
    nextSelectedFilePath: string | null
  ): Promise<void> => {
    clearArtifactCache(artifactCtx);
    await loadDirectory(artifactCtx, '', true);

    const expandedPaths = Object.entries(nextExpandedDirs)
      .filter(([path, expanded]) => path !== '' && expanded)
      .map(([path]) => path)
      .sort((a, b) => a.length - b.length);

    await Promise.all(
      expandedPaths.map(async (path) => {
        try {
          await loadDirectory(artifactCtx, path, true);
        } catch {
          // Ignore stale paths after mutations.
        }
      })
    );

    if (!nextSelectedFilePath) {
      setSelectedFile(artifactCtx, null);
      return;
    }

    try {
      await openFile(artifactCtx, nextSelectedFilePath, true);
    } catch {
      setSelectedFile(artifactCtx, null);
    }
  };

  const handleRefresh = () => {
    void reloadExplorerState(expandedDirs, selectedFilePath);
  };

  const handleOpenRename = (target: ExplorerEntryTarget) => {
    setPathActionError(null);
    setDeleteTarget(null);
    setRenameTarget(target);
    setRenameValue(target.name);
  };

  const closeRenameDialog = () => {
    if (isPathMutationPending) return;
    setRenameTarget(null);
    setRenameValue('');
  };

  const handleOpenDelete = (target: ExplorerEntryTarget) => {
    setPathActionError(null);
    setRenameTarget(null);
    setRenameValue('');
    setDeleteTarget(target);
  };

  const closeDeleteDialog = () => {
    if (isPathMutationPending) return;
    setDeleteTarget(null);
  };

  const handleDeleteConfirm = async (): Promise<void> => {
    if (!deleteTarget) {
      return;
    }

    setIsPathMutationPending(true);

    try {
      await deletePath(artifactCtx, { path: deleteTarget.path });
      const nextExpandedDirs = dropExpandedPath(expandedDirs, deleteTarget.path);
      setExpandedDirsByArtifact((prev) => ({
        ...prev,
        [artifactKey]: nextExpandedDirs,
      }));

      const nextSelectedFilePath =
        selectedFilePath && isSameOrChildPath(selectedFilePath, deleteTarget.path)
          ? null
          : selectedFilePath;

      setDeleteTarget(null);
      await reloadExplorerState(nextExpandedDirs, nextSelectedFilePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete path.';
      setPathActionError(message);
    } finally {
      setIsPathMutationPending(false);
    }
  };

  const handleRenameSubmit = async (): Promise<void> => {
    if (!renameTarget) return;

    const nextName = renameValue.trim();
    if (!nextName) {
      setPathActionError('Name is required.');
      return;
    }

    setIsPathMutationPending(true);
    setPathActionError(null);

    try {
      const result = await renamePath(artifactCtx, {
        path: renameTarget.path,
        newName: nextName,
      });

      const nextExpandedDirs = renameExpandedPath(expandedDirs, result.oldPath, result.newPath);
      setExpandedDirsByArtifact((prev) => ({
        ...prev,
        [artifactKey]: nextExpandedDirs,
      }));

      const nextSelectedFilePath =
        selectedFilePath && isSameOrChildPath(selectedFilePath, result.oldPath)
          ? replacePathPrefix(selectedFilePath, result.oldPath, result.newPath)
          : selectedFilePath;

      setRenameTarget(null);
      setRenameValue('');

      await reloadExplorerState(nextExpandedDirs, nextSelectedFilePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to rename path.';
      setPathActionError(message);
    } finally {
      setIsPathMutationPending(false);
    }
  };

  const toggleDirectory = (path: string) => {
    const safePath = normalizeRelativePath(path);
    const isExpanding = !(expandedDirs[safePath] ?? false);

    setExpandedDirsByArtifact((prev) => ({
      ...prev,
      [artifactKey]: {
        ...(prev[artifactKey] ?? ROOT_EXPANDED),
        [safePath]: isExpanding,
      },
    }));

    if (isExpanding) {
      void loadDirectory(artifactCtx, safePath);
    }
  };

  const renderEntryActions = (target: ExplorerEntryTarget): ReactNode => {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            onClick={(event) => event.stopPropagation()}
            className="text-muted-foreground hover:text-foreground data-[state=open]:bg-home-hover data-[state=open]:opacity-100 h-6 w-6 rounded opacity-0 transition-opacity group-hover:opacity-100"
            aria-label={`Actions for ${target.name}`}
            disabled={isPathMutationPending}
          >
            <Ellipsis size={14} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="right" className="w-[148px]">
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              handleOpenRename(target);
            }}
          >
            <Pencil size={14} />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={(event) => {
              event.preventDefault();
              handleOpenDelete(target);
            }}
          >
            <Trash2 size={14} />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const renderDirectory = (path: string, depth: number): ReactNode => {
    const safePath = normalizeRelativePath(path);
    const listing = directories[safePath];
    const requestKey = getDirectoryRequestKey(artifactKey, safePath);
    const isLoading = directoryLoadingByKey[requestKey] ?? false;
    const error = directoryErrorByKey[requestKey] ?? null;

    if (!listing) {
      if (isLoading) {
        return (
          <div
            className="px-3 py-2 text-xs text-muted-foreground"
            style={{ paddingLeft: `${14 + depth * 14}px` }}
          >
            Loading...
          </div>
        );
      }
      if (error) {
        return (
          <div
            className="px-3 py-2 text-xs text-red-500"
            style={{ paddingLeft: `${14 + depth * 14}px` }}
          >
            {error}
          </div>
        );
      }
      return null;
    }

    return listing.entries.map((entry) => {
      if (entry.type === 'directory') {
        const isExpanded = expandedDirs[entry.path] ?? false;

        return (
          <div key={entry.path}>
            <div className="px-1 py-0.5" style={{ paddingLeft: `${8 + depth * 14}px` }}>
              <div
                className={cn(
                  'group flex h-8 items-center rounded-lg pr-1 transition-colors hover:bg-home-hover'
                )}
              >
                <button
                  type="button"
                  onClick={() => toggleDirectory(entry.path)}
                  className={cn(
                    'flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 text-left text-[13px] text-foreground'
                  )}
                >
                  <ChevronRight
                    size={14}
                    className={cn(
                      'text-muted-foreground transition-transform',
                      isExpanded && 'rotate-90'
                    )}
                  />
                  {isExpanded ? (
                    <FolderOpen size={14} className="text-muted-foreground" />
                  ) : (
                    <Folder size={14} className="text-muted-foreground" />
                  )}
                  <span className="truncate">{entry.name}</span>
                </button>
                {renderEntryActions({
                  path: entry.path,
                  name: entry.name,
                  type: 'directory',
                })}
              </div>
            </div>
            {isExpanded ? renderDirectory(entry.path, depth + 1) : null}
          </div>
        );
      }

      const isSelected = selectedFilePath === entry.path;
      return (
        <div
          key={entry.path}
          className="px-1 py-0.5"
          style={{ paddingLeft: `${26 + depth * 14}px` }}
        >
          <div
            className={cn(
              'group flex h-8 items-center rounded-lg pr-1 transition-colors',
              isSelected ? 'bg-home-hover' : 'hover:bg-home-hover'
            )}
          >
            <button
              type="button"
              onClick={() => {
                void openFile(artifactCtx, entry.path);
              }}
              className={cn(
                'flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 text-left text-[13px]',
                isSelected ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              <FileText size={14} className="shrink-0" />
              <span className="truncate">{entry.name}</span>
            </button>
            {renderEntryActions({
              path: entry.path,
              name: entry.name,
              type: 'file',
            })}
          </div>
        </div>
      );
    });
  };

  return (
    <div ref={containerRef} className="flex h-full min-h-0 w-full">
      <aside
        className="border-home-border bg-home-panel flex h-full min-w-[220px] max-w-[70%] shrink-0 flex-col border-r"
        style={{ width: `${explorerWidthPx}px` }}
      >
        <div className="border-home-border flex h-10 shrink-0 items-center justify-between border-b px-3">
          <span className="text-foreground text-sm font-medium">Explorer</span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleRefresh}
            className="text-muted-foreground hover:text-foreground cursor-pointer"
            title="Refresh explorer"
          >
            <RefreshCw size={14} />
          </Button>
        </div>

        <div className="no-scrollbar min-h-0 flex-1 overflow-auto py-1">
          <div className="px-3 py-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            {artifact?.name ?? artifactId}
          </div>
          {pathActionError ? (
            <p className="px-3 py-1.5 text-xs text-red-500">{pathActionError}</p>
          ) : null}
          {isRootLoading && !directories[''] ? (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 size={14} className="animate-spin" />
              Loading files...
            </div>
          ) : rootError ? (
            <p className="px-3 py-2 text-xs text-red-500">{rootError}</p>
          ) : (
            renderDirectory('', 0)
          )}
        </div>
      </aside>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize explorer panel"
        onMouseDown={(e) => {
          e.preventDefault();
          setIsResizing(true);
        }}
        className="bg-home-border hover:bg-muted-foreground/40 w-1 cursor-col-resize"
      />

      <section className="bg-home-page flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="border-home-border bg-home-panel flex h-10 shrink-0 items-center justify-between border-b px-3">
          <span className="text-foreground truncate font-mono text-xs">
            {selectedFilePath ?? 'Select a file'}
          </span>
          {selectedFile ? (
            <span className="text-muted-foreground text-xs">
              {(selectedFile.size / 1024).toFixed(1)} KB
            </span>
          ) : null}
        </div>

        {!selectedFilePath ? (
          <div className="flex min-h-0 flex-1 items-center justify-center p-6">
            <p className="text-muted-foreground text-sm">
              Select a file from the explorer to preview it.
            </p>
          </div>
        ) : isSelectedFileLoading && !selectedFile ? (
          <div className="flex min-h-0 flex-1 items-center justify-center p-6">
            <Loader2 size={18} className="text-muted-foreground animate-spin" />
          </div>
        ) : selectedFileError ? (
          <div className="flex min-h-0 flex-1 items-center justify-center p-6">
            <p className="text-sm text-red-500">{selectedFileError}</p>
          </div>
        ) : selectedFile?.isBinary ? (
          <div className="flex min-h-0 flex-1 items-center justify-center p-6">
            <p className="text-muted-foreground text-sm">
              This file looks binary and cannot be previewed as text.
            </p>
          </div>
        ) : selectedFile ? (
          <div className="min-h-0 flex-1 overflow-auto">
            {selectedFile.truncated ? (
              <div className="bg-home-hover border-home-border border-b px-3 py-1.5 text-xs text-muted-foreground">
                Preview truncated for large file size.
              </div>
            ) : null}
            <pre className="min-w-full px-4 py-3 font-mono text-[13px] leading-6 text-foreground">
              <code>{selectedFile.content}</code>
            </pre>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center p-6">
            <p className="text-muted-foreground text-sm">File content unavailable.</p>
          </div>
        )}
      </section>

      <Dialog
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            closeRenameDialog();
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Rename {renameTarget?.type === 'directory' ? 'Folder' : 'File'}
            </DialogTitle>
            <DialogDescription>
              Update the name for <span className="font-medium">{renameTarget?.name}</span>.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleRenameSubmit();
            }}
            className="space-y-4"
          >
            <input
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              className="border-home-border bg-home-input text-foreground w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-sky-500/50"
              placeholder="Enter new name"
              autoFocus
              disabled={isPathMutationPending}
            />
            {pathActionError ? <p className="text-xs text-red-500">{pathActionError}</p> : null}

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={closeRenameDialog}
                disabled={isPathMutationPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPathMutationPending}>
                {isPathMutationPending ? 'Renaming...' : 'Rename'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            closeDeleteDialog();
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Delete {deleteTarget?.type === 'directory' ? 'Folder' : 'File'}
            </DialogTitle>
            <DialogDescription>
              This action cannot be undone.{' '}
              <span className="font-medium">{deleteTarget?.name}</span> will be permanently removed.
            </DialogDescription>
          </DialogHeader>

          {pathActionError ? <p className="text-xs text-red-500">{pathActionError}</p> : null}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={closeDeleteDialog}
              disabled={isPathMutationPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                void handleDeleteConfirm();
              }}
              disabled={isPathMutationPending}
            >
              {isPathMutationPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
