'use client';

import { ChevronRight, FileText, Folder, FolderOpen, Loader2, RefreshCw } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { ArtifactExplorerResult, ArtifactFileResult } from '@/lib/client-api';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useArtifactFilesStore, useSidebarStore, useUiStore } from '@/stores';

const EMPTY_DIRECTORY_MAP: Record<string, ArtifactExplorerResult> = {};
const EMPTY_FILE_MAP: Record<string, ArtifactFileResult> = {};
const EMPTY_LOADING_MAP: Record<string, boolean> = {};
const EMPTY_ERROR_MAP: Record<string, string | null> = {};
const ROOT_EXPANDED: Record<string, boolean> = { '': true };

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

  const [expandedDirsByArtifact, setExpandedDirsByArtifact] = useState<
    Record<string, Record<string, boolean>>
  >({});
  const [explorerWidthPx, setExplorerWidthPx] = useState(320);
  const [isResizing, setIsResizing] = useState(false);
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

  const handleRefresh = () => {
    const expandedPaths = Object.entries(expandedDirs)
      .filter(([, expanded]) => expanded)
      .map(([path]) => path);

    for (const path of expandedPaths) {
      void loadDirectory(artifactCtx, path, true);
    }

    if (selectedFilePath) {
      void openFile(artifactCtx, selectedFilePath, true);
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
            <button
              type="button"
              onClick={() => toggleDirectory(entry.path)}
              className={cn(
                'flex h-8 w-full items-center gap-1.5 pr-2 text-left text-[13px] text-foreground hover:bg-home-hover'
              )}
              style={{ paddingLeft: `${14 + depth * 14}px` }}
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
            {isExpanded ? renderDirectory(entry.path, depth + 1) : null}
          </div>
        );
      }

      const isSelected = selectedFilePath === entry.path;
      return (
        <button
          key={entry.path}
          type="button"
          onClick={() => {
            void openFile(artifactCtx, entry.path);
          }}
          className={cn(
            'flex h-8 w-full items-center gap-1.5 pr-2 text-left text-[13px] hover:bg-home-hover',
            isSelected ? 'bg-home-hover text-foreground' : 'text-muted-foreground'
          )}
          style={{ paddingLeft: `${32 + depth * 14}px` }}
        >
          <FileText size={14} className="shrink-0" />
          <span className="truncate">{entry.name}</span>
        </button>
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
    </div>
  );
}
