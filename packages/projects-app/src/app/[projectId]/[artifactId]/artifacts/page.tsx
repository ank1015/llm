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
  X,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { ArtifactExplorerResult, ArtifactFileDto } from '@/lib/client-api';
import type { ReactNode } from 'react';

import { ArtifactMarkdownPreview } from '@/components/artifact-markdown-preview';
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
import { getArtifactRawFileUrl } from '@/lib/client-api';
import { cn } from '@/lib/utils';
import { useArtifactFilesStore, useSidebarStore, useUiStore } from '@/stores';

const EMPTY_DIRECTORY_MAP: Record<string, ArtifactExplorerResult> = {};
const EMPTY_FILE_MAP: Record<string, ArtifactFileDto> = {};
const EMPTY_LOADING_MAP: Record<string, boolean> = {};
const EMPTY_ERROR_MAP: Record<string, string | null> = {};
const ROOT_EXPANDED: Record<string, boolean> = { '': true };

type ExplorerEntryTarget = {
  path: string;
  name: string;
  type: 'file' | 'directory';
};

type ViewerKind =
  | 'code'
  | 'markdown'
  | 'csv'
  | 'image'
  | 'pdf'
  | 'audio'
  | 'video'
  | 'text'
  | 'binary';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico']);
const PDF_EXTENSIONS = new Set(['pdf']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'mkv']);
const CSV_EXTENSIONS = new Set(['csv', 'tsv']);
const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown', 'mdx']);
const CODE_EXTENSIONS = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'json',
  'py',
  'go',
  'rs',
  'java',
  'kt',
  'rb',
  'php',
  'swift',
  'c',
  'h',
  'cpp',
  'hpp',
  'cs',
  'sh',
  'bash',
  'zsh',
  'yaml',
  'yml',
  'toml',
  'xml',
  'html',
  'css',
  'scss',
  'sql',
  'graphql',
  'proto',
  'ini',
  'env',
]);

const MAX_TABLE_ROWS = 500;
const MAX_TABLE_COLUMNS = 50;
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

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

function getPathBasename(path: string): string {
  const safePath = normalizeRelativePath(path);
  const segments = safePath.split('/');
  return segments[segments.length - 1] ?? safePath;
}

function getPathExtension(path: string): string {
  const base = getPathBasename(path);
  const dotIndex = base.lastIndexOf('.');
  if (dotIndex === -1 || dotIndex === base.length - 1) {
    return '';
  }
  return base.slice(dotIndex + 1).toLowerCase();
}

function getViewerKind(path: string, file: ArtifactFileDto | null): ViewerKind {
  const extension = getPathExtension(path);
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (PDF_EXTENSIONS.has(extension)) return 'pdf';
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio';
  if (VIDEO_EXTENSIONS.has(extension)) return 'video';
  if (CSV_EXTENSIONS.has(extension)) return 'csv';
  if (MARKDOWN_EXTENSIONS.has(extension)) return 'markdown';
  if (CODE_EXTENSIONS.has(extension)) return 'code';
  if (file?.isBinary) return 'binary';
  return 'text';
}

function resolveMonacoLanguage(path: string): string {
  const extension = getPathExtension(path);
  if (!extension) return 'plaintext';

  if (extension === 'tsx') return 'tsx';
  if (extension === 'ts') return 'ts';
  if (extension === 'jsx') return 'jsx';
  if (extension === 'js') return 'javascript';
  if (extension === 'json') return 'json';
  if (extension === 'md' || extension === 'markdown' || extension === 'mdx') return 'markdown';
  if (extension === 'yml') return 'yaml';
  if (extension === 'py') return 'python';
  if (extension === 'rs') return 'rust';
  if (extension === 'kt') return 'kotlin';
  if (extension === 'rb') return 'ruby';
  if (extension === 'cpp' || extension === 'hpp' || extension === 'h') return 'cpp';
  if (extension === 'c') return 'c';
  if (extension === 'cs') return 'csharp';
  if (extension === 'go') return 'go';
  if (extension === 'toml') return 'ini';
  if (extension === 'xml' || extension === 'svg') return 'xml';
  if (extension === 'sql') return 'sql';
  if (extension === 'graphql') return 'graphql';
  if (extension === 'proto') return 'protobuf';
  if (extension === 'sh' || extension === 'bash' || extension === 'zsh') return 'bash';
  if (extension === 'env') return 'ini';
  return extension;
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let value = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        value += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      cells.push(value);
      value = '';
      continue;
    }

    value += char;
  }

  cells.push(value);
  return cells;
}

function parseDelimitedTable(
  content: string,
  delimiter: string
): {
  rows: string[][];
  truncatedRows: boolean;
  truncatedColumns: boolean;
} {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const rows: string[][] = [];
  let truncatedColumns = false;
  const limitedLines = lines.slice(0, MAX_TABLE_ROWS);

  for (const line of limitedLines) {
    const parsed = parseDelimitedLine(line, delimiter);
    if (parsed.length > MAX_TABLE_COLUMNS) {
      truncatedColumns = true;
    }
    rows.push(parsed.slice(0, MAX_TABLE_COLUMNS));
  }

  return {
    rows,
    truncatedRows: lines.length > MAX_TABLE_ROWS,
    truncatedColumns,
  };
}

function ArtifactCodeViewer({ path, content }: { path: string; content: string }) {
  const language = useMemo(() => resolveMonacoLanguage(path), [path]);

  return (
    <div className="min-h-0 flex-1 overflow-hidden">
      <MonacoEditor
        height="100%"
        language={language}
        value={content}
        theme="vs-dark"
        options={{
          readOnly: true,
          minimap: { enabled: false },
          fontSize: 13,
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
          lineNumbers: 'on',
          lineDecorationsWidth: 12,
          wordWrap: 'off',
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          automaticLayout: true,
          renderWhitespace: 'selection',
          renderLineHighlight: 'line',
          guides: {
            indentation: true,
            bracketPairs: true,
          },
          bracketPairColorization: {
            enabled: true,
          },
          folding: true,
          glyphMargin: false,
          contextmenu: false,
          tabSize: 2,
          padding: {
            top: 10,
            bottom: 20,
          },
        }}
      />
    </div>
  );
}

function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const path of paths) {
    const safePath = normalizeRelativePath(path);
    if (!safePath || seen.has(safePath)) {
      continue;
    }
    seen.add(safePath);
    normalized.push(safePath);
  }

  return normalized;
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

function dropOpenTabs(paths: string[], removedPath: string): string[] {
  const safeRemoved = normalizeRelativePath(removedPath);
  if (!safeRemoved) {
    return uniquePaths(paths);
  }

  return uniquePaths(paths).filter((path) => !isSameOrChildPath(path, safeRemoved));
}

function renameOpenTabs(paths: string[], oldPath: string, newPath: string): string[] {
  const safeOldPath = normalizeRelativePath(oldPath);
  if (!safeOldPath) {
    return uniquePaths(paths);
  }

  return uniquePaths(paths).map((path) => {
    if (!isSameOrChildPath(path, safeOldPath)) {
      return path;
    }
    return replacePathPrefix(path, oldPath, newPath);
  });
}

function pickFallbackTab(
  originalPaths: string[],
  remainingPaths: string[],
  closedPath: string
): string | null {
  const originalTabs = uniquePaths(originalPaths);
  const remainingTabs = uniquePaths(remainingPaths);
  const remainingSet = new Set(remainingTabs);
  const closedIndex = originalTabs.findIndex((path) => path === normalizeRelativePath(closedPath));

  if (closedIndex === -1) {
    return remainingTabs[0] ?? null;
  }

  for (let i = closedIndex + 1; i < originalTabs.length; i += 1) {
    const candidate = originalTabs[i];
    if (remainingSet.has(candidate)) {
      return candidate;
    }
  }

  for (let i = closedIndex - 1; i >= 0; i -= 1) {
    const candidate = originalTabs[i];
    if (remainingSet.has(candidate)) {
      return candidate;
    }
  }

  return null;
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
  const [openTabsByArtifact, setOpenTabsByArtifact] = useState<Record<string, string[]>>({});
  const [explorerWidthPx, setExplorerWidthPx] = useState(320);
  const [isResizing, setIsResizing] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ExplorerEntryTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ExplorerEntryTarget | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [isPathMutationPending, setIsPathMutationPending] = useState(false);
  const [pathActionError, setPathActionError] = useState<string | null>(null);
  const expandedDirs = expandedDirsByArtifact[artifactKey] ?? ROOT_EXPANDED;
  const openTabs = openTabsByArtifact[artifactKey] ?? [];

  useEffect(() => {
    setSidebarCollapsed(true);
    clearArtifactCache(artifactCtx);
    setOpenTabsByArtifact((prev) => ({
      ...prev,
      [artifactKey]: [],
    }));
    setSelectedFile(artifactCtx, null);
    void loadDirectory(artifactCtx, '', true);
  }, [
    artifactCtx,
    artifactKey,
    clearArtifactCache,
    loadDirectory,
    setSelectedFile,
    setSidebarCollapsed,
  ]);

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
  const selectedViewerKind = selectedFilePath
    ? getViewerKind(selectedFilePath, selectedFile)
    : null;
  const selectedRawFileUrl = useMemo(() => {
    if (!selectedFilePath) return null;
    return getArtifactRawFileUrl(artifactCtx, { path: selectedFilePath });
  }, [artifactCtx, selectedFilePath]);
  const selectedTableData = useMemo(() => {
    if (!selectedFilePath || !selectedFile) return null;
    if (getViewerKind(selectedFilePath, selectedFile) !== 'csv') return null;
    const delimiter = getPathExtension(selectedFilePath) === 'tsv' ? '\t' : ',';
    return parseDelimitedTable(selectedFile.content, delimiter);
  }, [selectedFile, selectedFilePath]);

  const syncOpenTabs = (nextTabs: string[]) => {
    const normalizedTabs = uniquePaths(nextTabs);
    setOpenTabsByArtifact((prev) => ({
      ...prev,
      [artifactKey]: normalizedTabs,
    }));
    return normalizedTabs;
  };

  const addOpenTab = (path: string) => {
    const safePath = normalizeRelativePath(path);
    if (!safePath) {
      return;
    }

    setOpenTabsByArtifact((prev) => {
      const currentTabs = prev[artifactKey] ?? [];
      return {
        ...prev,
        [artifactKey]: uniquePaths([...currentTabs, safePath]),
      };
    });
  };

  const handleOpenFile = (path: string, force = false) => {
    const safePath = normalizeRelativePath(path);
    if (!safePath) {
      return;
    }

    addOpenTab(safePath);
    setSelectedFile(artifactCtx, safePath);
    void openFile(artifactCtx, safePath, force);
  };

  const handleSelectTab = (path: string) => {
    const safePath = normalizeRelativePath(path);
    if (!safePath) return;
    setSelectedFile(artifactCtx, safePath);
    void openFile(artifactCtx, safePath);
  };

  const handleCloseTab = (path: string) => {
    const safePath = normalizeRelativePath(path);
    if (!safePath) {
      return;
    }

    const nextTabs = uniquePaths(openTabs).filter((tabPath) => tabPath !== safePath);
    syncOpenTabs(nextTabs);

    if (selectedFilePath !== safePath) {
      return;
    }

    const fallbackPath = pickFallbackTab(openTabs, nextTabs, safePath);
    setSelectedFile(artifactCtx, fallbackPath);
    if (fallbackPath) {
      void openFile(artifactCtx, fallbackPath);
    }
  };

  const reloadExplorerState = async (
    nextExpandedDirs: Record<string, boolean>,
    nextSelectedFilePath: string | null,
    nextOpenTabs: string[]
  ): Promise<void> => {
    const normalizedTabs = syncOpenTabs(nextOpenTabs);
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
      syncOpenTabs(
        normalizedTabs.filter((path) => path !== normalizeRelativePath(nextSelectedFilePath))
      );
    }
  };

  const handleRefresh = () => {
    void reloadExplorerState(expandedDirs, selectedFilePath, openTabs);
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

      const nextOpenTabs = dropOpenTabs(openTabs, deleteTarget.path);
      let nextSelectedFilePath = selectedFilePath;
      if (selectedFilePath && isSameOrChildPath(selectedFilePath, deleteTarget.path)) {
        nextSelectedFilePath = pickFallbackTab(openTabs, nextOpenTabs, selectedFilePath);
      }

      setDeleteTarget(null);
      await reloadExplorerState(nextExpandedDirs, nextSelectedFilePath, nextOpenTabs);
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
      const nextOpenTabs = renameOpenTabs(openTabs, result.oldPath, result.newPath);

      setRenameTarget(null);
      setRenameValue('');

      await reloadExplorerState(nextExpandedDirs, nextSelectedFilePath, nextOpenTabs);
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
                handleOpenFile(entry.path);
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
    <div ref={containerRef} className="flex h-full min-h-0 w-full min-w-0 overflow-hidden">
      <aside
        className="border-home-border bg-home-panel flex h-full min-h-0 min-w-[220px] max-w-[70%] shrink-0 flex-col border-r"
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

      <section className="bg-home-page flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="border-home-border bg-home-panel flex h-10 shrink-0 items-center border-b">
          <div className="no-scrollbar min-w-0 flex-1 overflow-x-auto">
            {openTabs.length === 0 ? (
              <div className="text-muted-foreground flex h-10 items-center px-3 text-xs">
                Select a file
              </div>
            ) : (
              <div className="flex min-w-max items-center">
                {openTabs.map((tabPath) => {
                  const isActive = selectedFilePath === tabPath;
                  const tabLoading =
                    fileLoadingByKey[getFileRequestKey(artifactKey, tabPath)] ?? false;

                  return (
                    <div
                      key={tabPath}
                      className={cn(
                        'group border-home-border flex h-10 max-w-[260px] items-center border-r',
                        isActive
                          ? 'bg-home-hover text-foreground'
                          : 'text-muted-foreground hover:bg-home-hover/70'
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelectTab(tabPath)}
                        className="flex h-full min-w-0 items-center gap-1.5 px-3 text-left text-xs"
                        title={tabPath}
                      >
                        <FileText size={12} className="shrink-0" />
                        <span className="truncate">{getPathBasename(tabPath)}</span>
                        {tabLoading ? <Loader2 size={11} className="animate-spin" /> : null}
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleCloseTab(tabPath);
                        }}
                        className={cn(
                          'hover:bg-home-border mr-1 rounded p-0.5',
                          isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                        )}
                        aria-label={`Close ${getPathBasename(tabPath)}`}
                        title={`Close ${tabPath}`}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {selectedFile ? (
            <span className="text-muted-foreground border-home-border shrink-0 border-l px-3 text-xs">
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
        ) : selectedFile ? (
          <>
            {selectedFile.truncated ? (
              <div className="bg-home-hover border-home-border border-b px-3 py-1.5 text-xs text-muted-foreground">
                Preview truncated for large file size.
              </div>
            ) : null}

            {selectedViewerKind === 'code' ? (
              <ArtifactCodeViewer path={selectedFilePath ?? ''} content={selectedFile.content} />
            ) : null}

            {selectedViewerKind === 'markdown' ? (
              <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
                <ArtifactMarkdownPreview
                  artifactCtx={artifactCtx}
                  filePath={selectedFile.path}
                  className="px-2 py-1"
                >
                  {selectedFile.content}
                </ArtifactMarkdownPreview>
              </div>
            ) : null}

            {selectedViewerKind === 'csv' ? (
              <div className="min-h-0 flex-1 overflow-auto">
                {selectedTableData && selectedTableData.rows.length > 0 ? (
                  <table className="min-w-full border-separate border-spacing-0">
                    <thead className="bg-home-panel sticky top-0 z-10">
                      <tr>
                        {selectedTableData.rows[0].map((cell, index) => (
                          <th
                            key={`header-${index}`}
                            className="border-home-border border-b px-3 py-2 text-left text-xs font-semibold text-foreground"
                          >
                            {cell || `Column ${index + 1}`}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {selectedTableData.rows.slice(1).map((row, rowIndex) => (
                        <tr key={`row-${rowIndex}`} className="odd:bg-home-hover/35">
                          {row.map((cell, cellIndex) => (
                            <td
                              key={`cell-${rowIndex}-${cellIndex}`}
                              className="border-home-border border-b px-3 py-2 align-top font-mono text-xs text-foreground"
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="flex min-h-0 flex-1 items-center justify-center p-6">
                    <p className="text-muted-foreground text-sm">CSV file has no rows.</p>
                  </div>
                )}
                {selectedTableData?.truncatedRows || selectedTableData?.truncatedColumns ? (
                  <div className="bg-home-panel border-home-border border-t px-3 py-1.5 text-xs text-muted-foreground">
                    Table preview truncated for performance.
                  </div>
                ) : null}
              </div>
            ) : null}

            {selectedViewerKind === 'image' ? (
              <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
                <img
                  src={selectedRawFileUrl ?? ''}
                  alt={selectedFilePath ?? ''}
                  className="max-h-full max-w-full rounded border border-home-border object-contain shadow-sm"
                />
              </div>
            ) : null}

            {selectedViewerKind === 'pdf' ? (
              <iframe
                src={selectedRawFileUrl ?? ''}
                title={selectedFilePath ?? ''}
                className="min-h-0 w-full flex-1 border-0"
              />
            ) : null}

            {selectedViewerKind === 'audio' ? (
              <div className="flex min-h-0 flex-1 items-center justify-center p-8">
                <audio controls className="w-full max-w-2xl" src={selectedRawFileUrl ?? ''}>
                  <track kind="captions" />
                </audio>
              </div>
            ) : null}

            {selectedViewerKind === 'video' ? (
              <div className="flex min-h-0 flex-1 items-center justify-center p-4">
                <video
                  controls
                  className="max-h-full max-w-full rounded border border-home-border"
                  src={selectedRawFileUrl ?? ''}
                />
              </div>
            ) : null}

            {selectedViewerKind === 'text' ? (
              <div className="min-h-0 flex-1 overflow-auto">
                <pre className="m-0 min-w-full bg-transparent py-3 font-mono text-[13px] leading-[1.65rem] text-foreground">
                  <code>
                    {selectedFile.content.split('\n').map((line, index) => (
                      <div key={`txt-line-${index + 1}`} className="relative block pl-14 pr-4">
                        <span className="text-muted-foreground pointer-events-none absolute left-3 w-8 text-right text-xs">
                          {index + 1}
                        </span>
                        {line.length > 0 ? line : ' '}
                      </div>
                    ))}
                  </code>
                </pre>
              </div>
            ) : null}

            {selectedViewerKind === 'binary' ? (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
                <p className="text-muted-foreground text-sm">
                  This file is binary and cannot be rendered as text.
                </p>
                <Button asChild variant="outline" size="sm">
                  <a href={selectedRawFileUrl ?? '#'} target="_blank" rel="noreferrer">
                    Open Raw File
                  </a>
                </Button>
              </div>
            ) : null}
          </>
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
