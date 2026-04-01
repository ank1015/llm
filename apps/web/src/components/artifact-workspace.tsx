"use client";

import {
  Cancel01Icon,
  PencilEdit01Icon,
  SaveIcon,
  TextWrapIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ArtifactDialogFrame } from "@/components/artifact-dialog-frame";
import {
  ArtifactCodeDiffViewer,
  ArtifactCodeViewer,
} from "@/components/artifact-code-viewer";
import { CopyButton } from "@/components/copy-button";
import {
  useArtifactCheckpointDiffQuery,
  useRollbackArtifactCheckpointMutation,
} from "@/hooks/api";
import { getArtifactRawFileUrl } from "@/lib/client-api";
import { useArtifactFilesStore } from "@/stores/artifact-files-store";

import type {
  ArtifactCheckpointDiffFileDto,
  ArtifactContext,
  ArtifactFileDto,
} from "@/lib/client-api";
import type { Dispatch, RefObject, SetStateAction } from "react";

const DEFAULT_DRAWER_RATIO = 0.5;
const MIN_DRAWER_WIDTH = 320;
const MAX_DRAWER_WIDTH_RATIO = 0.66;
const MAX_TABLE_ROWS = 300;
const MAX_TABLE_COLUMNS = 32;
const WORD_WRAP_STORAGE_KEY = "artifact-preview-word-wrap";

type ViewerKind =
  | "code"
  | "csv"
  | "image"
  | "pdf"
  | "audio"
  | "video"
  | "text"
  | "binary";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"]);
const PDF_EXTENSIONS = new Set(["pdf"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "ogg", "m4a", "aac", "flac"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "mkv"]);
const CSV_EXTENSIONS = new Set(["csv", "tsv"]);
const CODE_EXTENSIONS = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "json",
  "py",
  "go",
  "rs",
  "java",
  "kt",
  "rb",
  "php",
  "swift",
  "c",
  "h",
  "cpp",
  "hpp",
  "cs",
  "sh",
  "bash",
  "zsh",
  "yaml",
  "yml",
  "toml",
  "xml",
  "html",
  "css",
  "scss",
  "sql",
  "graphql",
  "proto",
  "ini",
  "env",
  "md",
  "markdown",
  "mdx",
  "txt",
]);
const CODE_BASENAMES = new Set([
  ".editorconfig",
  ".gitattributes",
  ".gitignore",
  ".npmrc",
  ".prettierignore",
  ".prettierrc",
]);

function normalizeRelativePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").trim();
}

function getArtifactKey(ctx: ArtifactContext): string {
  return `${ctx.projectId}::${ctx.artifactId}`;
}

function getFileRequestKey(ctx: ArtifactContext, path: string): string {
  return `${getArtifactKey(ctx)}::file::${normalizeRelativePath(path)}`;
}

function getPathBasename(path: string): string {
  const safePath = normalizeRelativePath(path);
  const segments = safePath.split("/");
  return segments[segments.length - 1] ?? safePath;
}

function getPathExtension(path: string): string {
  const base = getPathBasename(path);
  const dotIndex = base.lastIndexOf(".");
  if (dotIndex === -1 || dotIndex === base.length - 1) {
    return "";
  }

  return base.slice(dotIndex + 1).toLowerCase();
}

function isCodeLikePath(path: string): boolean {
  const basename = getPathBasename(path).toLowerCase();
  const extension = getPathExtension(path);

  if (CODE_EXTENSIONS.has(extension)) {
    return true;
  }

  if (CODE_BASENAMES.has(basename)) {
    return true;
  }

  if (basename === ".env" || basename.startsWith(".env.")) {
    return true;
  }

  return false;
}

function getViewerKind(path: string, file: Pick<ArtifactFileDto, "isBinary"> | null): ViewerKind {
  const extension = getPathExtension(path);
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (PDF_EXTENSIONS.has(extension)) return "pdf";
  if (AUDIO_EXTENSIONS.has(extension)) return "audio";
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  if (CSV_EXTENSIONS.has(extension)) return "csv";
  if (file?.isBinary) return "binary";
  if (isCodeLikePath(path)) return "code";
  return "text";
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        value += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      cells.push(value);
      value = "";
      continue;
    }

    value += char;
  }

  cells.push(value);
  return cells;
}

function parseDelimitedTable(content: string, delimiter: string) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const rows = lines.slice(0, MAX_TABLE_ROWS).map((line) => {
    const parsed = parseDelimitedLine(line, delimiter);
    return parsed.slice(0, MAX_TABLE_COLUMNS);
  });

  return {
    rows,
    truncatedRows: lines.length > MAX_TABLE_ROWS,
  };
}

function clampDrawerRatio(nextRatio: number): number {
  if (!Number.isFinite(nextRatio)) {
    return DEFAULT_DRAWER_RATIO;
  }

  return Math.min(MAX_DRAWER_WIDTH_RATIO, Math.max(MIN_DRAWER_WIDTH / 1440, nextRatio));
}

export function getClampedArtifactDrawerWidth(
  containerWidth: number,
  drawerRatio: number,
): number {
  const maxWidth = Math.max(MIN_DRAWER_WIDTH, containerWidth * MAX_DRAWER_WIDTH_RATIO);
  return Math.min(maxWidth, Math.max(MIN_DRAWER_WIDTH, Math.floor(containerWidth * drawerRatio)));
}

export function ArtifactPreviewDrawer({
  artifactContext,
  containerRef,
  drawerWidth,
  isOpen,
  isResizing,
  onResizingChange,
  setDrawerRatio,
}: {
  artifactContext: ArtifactContext;
  containerRef: RefObject<HTMLDivElement | null>;
  drawerWidth: number;
  isOpen: boolean;
  isResizing: boolean;
  onResizingChange: (value: boolean) => void;
  setDrawerRatio: Dispatch<SetStateAction<number>>;
}) {
  const artifactKey = getArtifactKey(artifactContext);
  const openFile = useArtifactFilesStore((state) => state.openFile);
  const saveFile = useArtifactFilesStore((state) => state.saveFile);
  const setSelectedFile = useArtifactFilesStore((state) => state.setSelectedFile);
  const setSelectedDiffFile = useArtifactFilesStore((state) => state.setSelectedDiffFile);
  const closePreview = useArtifactFilesStore((state) => state.closePreview);
  const clearArtifactCache = useArtifactFilesStore((state) => state.clearArtifactCache);
  const previewMode = useArtifactFilesStore(
    (state) => state.previewModeByArtifact[artifactKey] ?? null,
  );
  const selectedFilePath = useArtifactFilesStore(
    (state) => state.selectedFileByArtifact[artifactKey] ?? null,
  );
  const selectedDiffFilePath = useArtifactFilesStore(
    (state) => state.selectedDiffFileByArtifact[artifactKey] ?? null,
  );
  const selectedFile = useArtifactFilesStore((state) => {
    const path = state.selectedFileByArtifact[artifactKey] ?? null;
    if (!path) {
      return null;
    }

    return state.filesByArtifact[artifactKey]?.[path] ?? null;
  });
  const fileLoadingByKey = useArtifactFilesStore((state) => state.fileLoadingByKey);
  const fileErrorByKey = useArtifactFilesStore((state) => state.fileErrorByKey);
  const checkpointDiffQuery = useArtifactCheckpointDiffQuery(artifactContext, {
    enabled: isOpen && previewMode === "diff",
  });
  const rollbackCheckpoint = useRollbackArtifactCheckpointMutation(artifactContext);
  const [isWordWrapEnabled, setIsWordWrapEnabled] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftContent, setDraftContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isRollbackDialogOpen, setIsRollbackDialogOpen] = useState(false);

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    function handleMouseMove(event: MouseEvent) {
      const container = containerRef.current;
      if (!container) {
        return;
      }

      const rect = container.getBoundingClientRect();
      const nextWidth = rect.right - event.clientX;
      const maxWidth = Math.max(MIN_DRAWER_WIDTH, rect.width * MAX_DRAWER_WIDTH_RATIO);
      const clampedWidth = Math.min(maxWidth, Math.max(MIN_DRAWER_WIDTH, nextWidth));
      setDrawerRatio(clampDrawerRatio(clampedWidth / rect.width));
    }

    function handleMouseUp() {
      onResizingChange(false);
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [containerRef, isResizing, onResizingChange, setDrawerRatio]);

  useEffect(() => {
    if (previewMode !== "file" || !selectedFilePath || selectedFile) {
      return;
    }

    const requestKey = getFileRequestKey(artifactContext, selectedFilePath);
    if (fileLoadingByKey[requestKey]) {
      return;
    }

    void openFile(artifactContext, selectedFilePath);
  }, [
    artifactContext,
    artifactContext.artifactId,
    artifactContext.projectId,
    fileLoadingByKey,
    openFile,
    previewMode,
    selectedFile,
    selectedFilePath,
  ]);

  useEffect(() => {
    if (previewMode !== "diff") {
      return;
    }

    const files = checkpointDiffQuery.data?.files ?? [];
    if (files.length === 0) {
      if (selectedDiffFilePath) {
        setSelectedDiffFile(artifactContext, null);
      }
      return;
    }

    if (!selectedDiffFilePath || !files.some((file) => file.path === selectedDiffFilePath)) {
      setSelectedDiffFile(artifactContext, files[0]?.path ?? null);
    }
  }, [
    artifactContext,
    checkpointDiffQuery.data?.files,
    previewMode,
    selectedDiffFilePath,
    setSelectedDiffFile,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const stored = window.localStorage.getItem(WORD_WRAP_STORAGE_KEY);
    if (!stored) {
      return;
    }

    setIsWordWrapEnabled(stored === "true");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(WORD_WRAP_STORAGE_KEY, String(isWordWrapEnabled));
  }, [isWordWrapEnabled]);

  useEffect(() => {
    if (previewMode !== "file" || !selectedFilePath || !selectedFile) {
      setIsEditing(false);
      setDraftContent("");
      return;
    }

    setIsEditing(false);
    setDraftContent(selectedFile.content);
  }, [previewMode, selectedFile, selectedFile?.updatedAt, selectedFile?.content, selectedFilePath]);

  const selectedDiffFile =
    checkpointDiffQuery.data?.files.find((file) => file.path === selectedDiffFilePath) ?? null;
  const requestKey =
    previewMode === "file" && selectedFilePath
      ? getFileRequestKey(artifactContext, selectedFilePath)
      : null;
  const isLoading = requestKey ? (fileLoadingByKey[requestKey] ?? false) : false;
  const error = requestKey ? (fileErrorByKey[requestKey] ?? null) : null;
  const viewerKind =
    previewMode === "file" && selectedFilePath ? getViewerKind(selectedFilePath, selectedFile) : null;
  const diffViewerKind =
    selectedDiffFile ? getViewerKind(selectedDiffFile.path, selectedDiffFile) : null;
  const supportsWordWrap =
    previewMode === "file"
      ? viewerKind === "code" || viewerKind === "text"
      : Boolean(
          selectedDiffFile &&
            !selectedDiffFile.isBinary &&
            diffViewerKind !== "image" &&
            diffViewerKind !== "pdf" &&
            diffViewerKind !== "audio" &&
            diffViewerKind !== "video",
        );
  const supportsEditing =
    previewMode === "file" &&
    viewerKind === "code" &&
    Boolean(selectedFile) &&
    !selectedFile?.truncated;
  const supportsCopy =
    previewMode === "file" &&
    Boolean(selectedFile) &&
    (viewerKind === "code" || viewerKind === "csv" || viewerKind === "text");
  const copyText =
    supportsCopy && selectedFile
      ? isEditing
        ? draftContent
        : selectedFile.content
      : "";
  const rawFileUrl =
    previewMode === "file" && selectedFilePath
      ? getArtifactRawFileUrl(artifactContext, { path: selectedFilePath })
      : selectedDiffFile && selectedDiffFile.changeType !== "deleted"
        ? getArtifactRawFileUrl(artifactContext, { path: selectedDiffFile.path })
        : null;
  const tableData =
    previewMode === "file" && selectedFile && selectedFilePath && viewerKind === "csv"
      ? parseDelimitedTable(
          selectedFile.content,
          getPathExtension(selectedFilePath) === "tsv" ? "\t" : ",",
        )
      : null;
  const headerTitle =
    previewMode === "diff" ? "Latest diff" : selectedFilePath ? getPathBasename(selectedFilePath) : "";
  const isPreviewTruncated =
    previewMode === "file" ? Boolean(selectedFile?.truncated) : Boolean(selectedDiffFile?.textTruncated);
  const canRollbackToHead = Boolean(
    checkpointDiffQuery.data?.headCommitHash && checkpointDiffQuery.data?.dirty,
  );

  async function handleSaveFile() {
    if (previewMode !== "file" || !selectedFilePath || !selectedFile) {
      return;
    }

    if (draftContent === selectedFile.content) {
      setIsEditing(false);
      return;
    }

    try {
      setIsSaving(true);
      const savedFile = await saveFile(artifactContext, {
        path: selectedFilePath,
        content: draftContent,
      });
      setDraftContent(savedFile.content);
      setIsEditing(false);
      toast.success("File saved.");
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Failed to save file.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRollbackToHead() {
    try {
      await rollbackCheckpoint.mutateAsync();
      clearArtifactCache(artifactContext);
      toast.success("Artifact restored to the latest checkpoint.");
      setIsRollbackDialogOpen(false);
    } catch (rollbackError) {
      toast.error(
        rollbackError instanceof Error ? rollbackError.message : "Failed to roll back artifact.",
      );
    }
  }

  return (
    <div
      className={[
        "absolute inset-y-0 right-0 z-20 flex h-full max-w-full will-change-transform transition-transform duration-300 ease-out",
        isOpen ? "translate-x-0" : "translate-x-[calc(100%+4px)] pointer-events-none",
      ].join(" ")}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize preview drawer"
        onMouseDown={(event) => {
          event.preventDefault();
          onResizingChange(true);
        }}
        className="w-1 cursor-col-resize bg-black/6 transition-colors hover:bg-black/14 dark:bg-white/8 dark:hover:bg-white/16"
      />

      <aside
        className={[
          "flex h-full flex-col overflow-hidden border-l border-black/6 bg-[#FCFBFC] shadow-[-16px_0_36px_rgba(0,0,0,0.08)] dark:border-white/8 dark:bg-[#0E0E0E] dark:shadow-[-16px_0_36px_rgba(0,0,0,0.26)]",
          isResizing ? "transition-none" : "transition-[width] duration-300 ease-out",
        ].join(" ")}
        style={{ width: `${drawerWidth}px` }}
      >
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-black/6 px-4 dark:border-white/8">
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-black dark:text-white">
            {headerTitle}
          </p>

          {previewMode === "diff" ? (
            <button
              type="button"
              onClick={() => setIsRollbackDialogOpen(true)}
              disabled={!canRollbackToHead || rollbackCheckpoint.isPending}
              className="inline-flex h-8 items-center justify-center rounded-md px-3 text-xs font-medium text-[#FF6363] transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {rollbackCheckpoint.isPending ? "Rolling back..." : "Rollback"}
            </button>
          ) : null}

          {supportsEditing ? (
            <button
              type="button"
              onClick={() => {
                if (isEditing) {
                  void handleSaveFile();
                  return;
                }

                setDraftContent(selectedFile?.content ?? "");
                setIsEditing(true);
              }}
              disabled={isSaving}
              className={[
                "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/12 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-white/12",
                isEditing
                  ? "bg-accent text-[#FF6363]"
                  : "text-black/48 hover:bg-accent hover:text-black dark:text-white/52 dark:hover:bg-accent dark:hover:text-white",
              ].join(" ")}
              aria-label={isEditing ? "Save file" : "Edit file"}
              title={isEditing ? "Save file" : "Edit file"}
            >
              <HugeiconsIcon
                icon={isEditing ? SaveIcon : PencilEdit01Icon}
                size={15}
                color="currentColor"
                strokeWidth={1.8}
              />
            </button>
          ) : null}

          {supportsWordWrap ? (
            <button
              type="button"
              onClick={() => setIsWordWrapEnabled((current) => !current)}
              className={[
                "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/12 dark:focus-visible:ring-white/12",
                isWordWrapEnabled
                  ? "bg-accent text-[#FF6363]"
                  : "text-black/48 hover:bg-accent hover:text-black dark:text-white/52 dark:hover:bg-accent dark:hover:text-white",
              ].join(" ")}
              aria-label={isWordWrapEnabled ? "Disable wrapped lines" : "Enable wrapped lines"}
              title={isWordWrapEnabled ? "Disable wrapped lines" : "Enable wrapped lines"}
            >
              <HugeiconsIcon
                icon={TextWrapIcon}
                size={14}
                color="currentColor"
                strokeWidth={1.8}
              />
            </button>
          ) : null}

          {supportsCopy ? (
            <CopyButton
              text={copyText}
              ariaLabel="Copy file contents"
              title="Copy file contents"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md p-0 text-black/48 transition-colors hover:bg-accent hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/12 dark:text-white/52 dark:hover:bg-accent dark:hover:text-white dark:focus-visible:ring-white/12"
            />
          ) : null}

          <button
            type="button"
            onClick={() => closePreview(artifactContext)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-black/48 transition-colors hover:bg-accent hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/12 dark:text-white/52 dark:hover:bg-accent dark:hover:text-white dark:focus-visible:ring-white/12"
            aria-label="Close preview"
            title="Close preview"
          >
            <HugeiconsIcon
              icon={Cancel01Icon}
              size={16}
              color="currentColor"
              strokeWidth={1.8}
            />
          </button>
        </header>

        {isPreviewTruncated ? (
          <div className="border-b border-black/6 px-4 py-2 text-xs text-black/48 dark:border-white/8 dark:text-white/48">
            Preview truncated for large file size.
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-hidden">
          {previewMode === "diff" ? (
            <ArtifactCheckpointDiffBody
              artifactContext={artifactContext}
              diffData={checkpointDiffQuery.data ?? null}
              isPending={checkpointDiffQuery.isPending}
              error={
                checkpointDiffQuery.error instanceof Error
                  ? checkpointDiffQuery.error.message
                  : checkpointDiffQuery.isError
                    ? "Could not load diff."
                    : null
              }
              selectedDiffFile={selectedDiffFile}
              onSelectDiffFile={(path) => setSelectedDiffFile(artifactContext, path)}
              rawFileUrl={rawFileUrl}
              viewerKind={diffViewerKind}
              wordWrapEnabled={isWordWrapEnabled}
            />
          ) : !selectedFilePath ? null : isLoading && !selectedFile ? (
            <div className="flex h-full items-center justify-center px-6">
              <p className="text-sm text-black/46 dark:text-white/46">Loading preview...</p>
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center px-6">
              <p className="text-sm text-[#FF6363]">{error}</p>
            </div>
          ) : !selectedFile ? (
            <div className="flex h-full items-center justify-center px-6">
              <p className="text-sm text-black/46 dark:text-white/46">Select a file to preview it.</p>
            </div>
          ) : viewerKind === "image" && selectedFilePath && rawFileUrl ? (
            <div className="flex h-full items-center justify-center p-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={rawFileUrl}
                alt={getPathBasename(selectedFilePath)}
                className="max-h-full max-w-full rounded-2xl object-contain"
              />
            </div>
          ) : viewerKind === "pdf" && selectedFilePath && rawFileUrl ? (
            <iframe title={selectedFilePath} src={rawFileUrl} className="h-full w-full" />
          ) : viewerKind === "audio" && rawFileUrl ? (
            <div className="flex h-full items-center justify-center p-6">
              <audio controls src={rawFileUrl} className="w-full max-w-xl" />
            </div>
          ) : viewerKind === "video" && rawFileUrl ? (
            <div className="flex h-full items-center justify-center p-5">
              <video controls src={rawFileUrl} className="max-h-full max-w-full rounded-2xl" />
            </div>
          ) : viewerKind === "code" && selectedFilePath && selectedFile ? (
            <ArtifactCodeViewer
              path={selectedFilePath}
              content={isEditing ? draftContent : selectedFile.content}
              editable={isEditing}
              onChange={setDraftContent}
              wordWrapEnabled={isWordWrapEnabled}
            />
          ) : viewerKind === "csv" && tableData && tableData.rows.length > 0 ? (
            <div className="h-full overflow-auto">
              <table className="min-w-full border-separate border-spacing-0">
                <thead className="sticky top-0 z-10 bg-[#FCFBFC] dark:bg-[#0E0E0E]">
                  <tr>
                    {tableData.rows[0].map((cell, index) => (
                      <th
                        key={`header-${index}`}
                        className="border-b border-black/6 px-3 py-2 text-left text-xs font-medium text-black dark:border-white/8 dark:text-white"
                      >
                        {cell || `Column ${index + 1}`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableData.rows.slice(1).map((row, rowIndex) => (
                    <tr key={`row-${rowIndex}`} className="odd:bg-accent/65">
                      {row.map((cell, cellIndex) => (
                        <td
                          key={`cell-${rowIndex}-${cellIndex}`}
                          className="border-b border-black/6 px-3 py-2 align-top font-mono text-xs text-black/82 dark:border-white/8 dark:text-white/82"
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>

              {tableData.truncatedRows ? (
                <p className="px-4 py-3 text-xs text-black/46 dark:text-white/46">
                  Showing the first {MAX_TABLE_ROWS} rows.
                </p>
              ) : null}
            </div>
          ) : viewerKind === "binary" ? (
            <div className="flex h-full items-center justify-center px-6">
              <p className="max-w-sm text-center text-sm text-black/46 dark:text-white/46">
                This file is binary and cannot be previewed inline.
              </p>
            </div>
          ) : (
            <pre
              className={[
                "min-h-full overflow-auto px-5 py-4 font-mono text-[13px] leading-6 text-black/84 dark:text-white/84",
                isWordWrapEnabled ? "break-words whitespace-pre-wrap" : "whitespace-pre",
              ].join(" ")}
            >
              {selectedFile.content}
            </pre>
          )}
        </div>

        {isRollbackDialogOpen ? (
          <ArtifactDialogFrame
            title="Discard unsaved changes"
            description="This will discard the current artifact changes and restore the working tree back to the latest saved checkpoint."
            onClose={() => {
              if (rollbackCheckpoint.isPending) {
                return;
              }

              setIsRollbackDialogOpen(false);
            }}
            footer={
              <>
                <button
                  type="button"
                  onClick={() => setIsRollbackDialogOpen(false)}
                  disabled={rollbackCheckpoint.isPending}
                  className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-medium text-black/58 transition-colors hover:bg-accent hover:text-black disabled:cursor-not-allowed disabled:opacity-50 dark:text-white/58 dark:hover:bg-accent dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleRollbackToHead();
                  }}
                  disabled={!canRollbackToHead || rollbackCheckpoint.isPending}
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-[#FF6363] px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {rollbackCheckpoint.isPending ? "Rolling back..." : "Rollback"}
                </button>
              </>
            }
          >
            <div className="rounded-2xl bg-accent px-4 py-3 text-sm leading-6 text-black/62 dark:text-white/60">
              Any uncommitted changes in this artifact will be removed.
            </div>
          </ArtifactDialogFrame>
        ) : null}
      </aside>
    </div>
  );
}

function ArtifactCheckpointDiffBody({
  artifactContext,
  diffData,
  isPending,
  error,
  selectedDiffFile,
  onSelectDiffFile,
  rawFileUrl,
  viewerKind,
  wordWrapEnabled,
}: {
  artifactContext: ArtifactContext;
  diffData: {
    files: ArtifactCheckpointDiffFileDto[];
  } | null;
  isPending: boolean;
  error: string | null;
  selectedDiffFile: ArtifactCheckpointDiffFileDto | null;
  onSelectDiffFile: (path: string) => void;
  rawFileUrl: string | null;
  viewerKind: ViewerKind | null;
  wordWrapEnabled: boolean;
}) {
  if (isPending && !diffData) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <p className="text-sm text-black/46 dark:text-white/46">Loading diff...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <p className="text-sm text-[#FF6363]">{error}</p>
      </div>
    );
  }

  if (!diffData || diffData.files.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <p className="max-w-sm text-center text-sm text-black/46 dark:text-white/46">
          No unsaved changes in this artifact.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="max-h-44 shrink-0 overflow-y-auto border-b border-black/6 px-2 py-2 dark:border-white/8">
        <div className="flex flex-col gap-1">
          {diffData.files.map((file) => {
            const isActive = selectedDiffFile?.path === file.path;
            return (
              <button
                key={file.path}
                type="button"
                onClick={() => onSelectDiffFile(file.path)}
                className={[
                  "flex items-start gap-3 rounded-xl px-3 py-2 text-left transition-colors",
                  isActive ? "bg-accent" : "hover:bg-accent/80",
                ].join(" ")}
              >
                <span className="mt-1 inline-flex rounded-full bg-black/6 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-black/52 dark:bg-white/8 dark:text-white/54">
                  {file.changeType}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-black dark:text-white">
                    {file.path}
                  </span>
                  {file.previousPath ? (
                    <span className="block truncate text-xs text-black/42 dark:text-white/42">
                      from {file.previousPath}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {!selectedDiffFile ? (
          <div className="flex h-full items-center justify-center px-6">
            <p className="text-sm text-black/46 dark:text-white/46">Select a changed file.</p>
          </div>
        ) : (
          <ArtifactCheckpointDiffViewer
            file={selectedDiffFile}
            rawFileUrl={rawFileUrl}
            viewerKind={viewerKind}
            wordWrapEnabled={wordWrapEnabled}
          />
        )}
      </div>
    </div>
  );
}

function ArtifactCheckpointDiffViewer({
  file,
  rawFileUrl,
  viewerKind,
  wordWrapEnabled,
}: {
  file: ArtifactCheckpointDiffFileDto;
  rawFileUrl: string | null;
  viewerKind: ViewerKind | null;
  wordWrapEnabled: boolean;
}) {
  const banner = (
    <div className="border-b border-black/6 px-4 py-2 text-xs text-black/48 dark:border-white/8 dark:text-white/48">
      {getDiffStatusLabel(file)}
      {file.previousPath ? ` from ${file.previousPath}` : ""}
    </div>
  );

  if (viewerKind === "image" && rawFileUrl && file.changeType !== "deleted") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {banner}
        <div className="flex min-h-0 flex-1 items-center justify-center p-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={rawFileUrl}
            alt={getPathBasename(file.path)}
            className="max-h-full max-w-full rounded-2xl object-contain"
          />
        </div>
      </div>
    );
  }

  if (viewerKind === "pdf" && rawFileUrl && file.changeType !== "deleted") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {banner}
        <iframe title={file.path} src={rawFileUrl} className="min-h-0 flex-1" />
      </div>
    );
  }

  if (viewerKind === "audio" && rawFileUrl && file.changeType !== "deleted") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {banner}
        <div className="flex min-h-0 flex-1 items-center justify-center p-6">
          <audio controls src={rawFileUrl} className="w-full max-w-xl" />
        </div>
      </div>
    );
  }

  if (viewerKind === "video" && rawFileUrl && file.changeType !== "deleted") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {banner}
        <div className="flex min-h-0 flex-1 items-center justify-center p-5">
          <video controls src={rawFileUrl} className="max-h-full max-w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (file.isBinary) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {banner}
        <div className="flex min-h-0 flex-1 items-center justify-center px-6">
          <p className="max-w-sm text-center text-sm text-black/46 dark:text-white/46">
            This file is binary and cannot be diffed inline.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {banner}
      <div className="min-h-0 flex-1">
        <ArtifactCodeDiffViewer
          path={file.path}
          beforeContent={file.beforeText ?? ""}
          afterContent={file.afterText ?? ""}
          wordWrapEnabled={wordWrapEnabled}
        />
      </div>
    </div>
  );
}

function getDiffStatusLabel(file: ArtifactCheckpointDiffFileDto): string {
  switch (file.changeType) {
    case "added":
      return "Added since latest commit";
    case "deleted":
      return "Deleted since latest commit";
    case "renamed":
      return "Renamed since latest commit";
    default:
      return "Changed since latest commit";
  }
}

export function ArtifactWorkspace() {
  const { artifactId } = useParams<{ artifactId: string }>();

  return <div className="h-full min-h-0 w-full min-w-0" data-artifact-id={artifactId} />;
}
