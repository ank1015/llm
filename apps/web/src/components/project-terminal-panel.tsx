"use client";

import { Add01Icon, ComputerTerminal01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { ProjectTerminalSurface } from "@/components/project-terminal-surface";
import { queryKeys } from "@/lib/query-keys";
import { useArtifactFilesStore } from "@/stores/artifact-files-store";
import {
  getTerminalArtifactKey,
  getTerminalRecordKey,
  useTerminalStore,
} from "@/stores/terminals-store";

import type { ArtifactContext } from "@/lib/client-api";
import type { TerminalDockState } from "@/stores/terminals-store";

const TERMINAL_SHORTCUT_LABEL = "Ctrl+`";
const EDITABLE_SHORTCUT_TARGET_SELECTOR =
  "input, textarea, select, [contenteditable]:not([contenteditable='false'])";
const TERMINAL_SHORTCUT_ALLOWED_TARGET_SELECTOR =
  ".artifact-terminal-surface, .xterm, .xterm-helper-textarea";
const EMPTY_DOCK_STATE: TerminalDockState = {
  open: false,
  heightPx: 320,
  hasHydrated: false,
  isLoading: false,
  error: null,
  terminalIds: [],
  activeTerminalId: null,
  lastHydratedAt: null,
  filesystemEpoch: 0,
};

function shouldIgnoreTerminalShortcut(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.closest(TERMINAL_SHORTCUT_ALLOWED_TARGET_SELECTOR)) {
    return false;
  }

  if (target.closest(".monaco-editor")) {
    return false;
  }

  return Boolean(target.closest(EDITABLE_SHORTCUT_TARGET_SELECTOR));
}

export function ProjectTerminalPanel({
  artifactContext,
}: {
  artifactContext: ArtifactContext;
}) {
  const artifactKey = getTerminalArtifactKey(
    artifactContext.projectId,
    artifactContext.artifactId,
  );
  const queryClient = useQueryClient();
  const hostRef = useRef<HTMLDivElement>(null);
  const lastReloadedFilesystemEpochRef = useRef(0);
  const [isResizing, setIsResizing] = useState(false);

  const dock = useTerminalStore((state) =>
    state.dockByArtifact[artifactKey] ?? EMPTY_DOCK_STATE,
  );
  const terminalsById = useTerminalStore((state) => state.terminalsById);
  const activateArtifact = useTerminalStore((state) => state.activateArtifact);
  const deactivateArtifact = useTerminalStore((state) => state.deactivateArtifact);
  const setArtifactVisibility = useTerminalStore((state) => state.setArtifactVisibility);
  const toggleDock = useTerminalStore((state) => state.toggleDock);
  const createTerminal = useTerminalStore((state) => state.createTerminal);
  const setDockHeight = useTerminalStore((state) => state.setDockHeight);
  const clearDockError = useTerminalStore((state) => state.clearDockError);
  const selectedFilePath = useArtifactFilesStore(
    (state) => state.selectedFileByArtifact[artifactKey] ?? null,
  );
  const previewMode = useArtifactFilesStore(
    (state) => state.previewModeByArtifact[artifactKey] ?? null,
  );
  const openFile = useArtifactFilesStore((state) => state.openFile);

  const activeTerminal = dock.activeTerminalId
    ? (terminalsById[getTerminalRecordKey(artifactContext, dock.activeTerminalId)] ?? null)
    : null;

  useEffect(() => {
    void activateArtifact(artifactContext).catch(() => undefined);

    return () => {
      deactivateArtifact(artifactContext);
    };
  }, [activateArtifact, artifactContext, deactivateArtifact]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setArtifactVisibility(artifactContext, document.visibilityState === "visible");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [artifactContext, setArtifactVisibility]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.isComposing ||
        event.repeat ||
        !event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey ||
        event.code !== "Backquote"
      ) {
        return;
      }

      if (shouldIgnoreTerminalShortcut(event.target)) {
        return;
      }

      event.preventDefault();
      void toggleDock(artifactContext).catch(() => undefined);
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [artifactContext, toggleDock]);

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const host = hostRef.current;
      const container = host?.parentElement;
      if (!host || !container) {
        return;
      }

      const rect = container.getBoundingClientRect();
      const nextHeight = rect.bottom - event.clientY;
      setDockHeight(artifactContext, nextHeight, rect.height);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "row-resize";

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [artifactContext, isResizing, setDockHeight]);

  useEffect(() => {
    if (
      dock.filesystemEpoch === 0 ||
      dock.filesystemEpoch === lastReloadedFilesystemEpochRef.current
    ) {
      return;
    }

    lastReloadedFilesystemEpochRef.current = dock.filesystemEpoch;

    void Promise.allSettled([
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.artifacts.scope(artifactContext), "explorer"],
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.artifacts.checkpoints(artifactContext),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.artifacts.checkpointDiff(artifactContext),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.projects.fileIndexRoot(artifactContext.projectId),
      }),
    ]);

    if (previewMode === "file" && selectedFilePath) {
      void openFile(artifactContext, selectedFilePath, true).catch(() => undefined);
    }
  }, [
    artifactContext,
    dock.filesystemEpoch,
    openFile,
    previewMode,
    queryClient,
    selectedFilePath,
  ]);

  return (
    <div ref={hostRef} className="flex shrink-0 flex-col">
      {dock.open ? (
        <>
          <div
            role="separator"
            aria-label="Resize terminal panel"
            aria-orientation="horizontal"
            onMouseDown={(event) => {
              event.preventDefault();
              setIsResizing(true);
            }}
            className="relative flex h-3 cursor-row-resize items-center justify-center bg-home-page"
          >
            <div className="h-px w-full bg-black/6 dark:bg-white/8" />
            <div className="absolute h-px w-10 rounded-full bg-black/16 dark:bg-white/18" />
          </div>

          <div
            className="relative min-h-0 shrink-0 overflow-hidden bg-[var(--terminal-surface-bg)]"
            style={{ height: `${dock.heightPx}px` }}
          >
            {dock.error ? (
              <div className="absolute inset-x-0 top-0 z-30 flex items-center justify-between border-b border-[#E7C6C6] bg-[#FDEBEC] px-3 py-2 text-xs text-[#9F2F2D] dark:border-[#4A2525] dark:bg-[#201312] dark:text-[#F2B5B3]">
                <span>{dock.error}</span>
                <button
                  type="button"
                  onClick={() => clearDockError(artifactContext)}
                  className="cursor-pointer text-black/56 transition-colors hover:text-black dark:text-white/58 dark:hover:text-white"
                >
                  Dismiss
                </button>
              </div>
            ) : null}

            {activeTerminal ? (
              <ProjectTerminalSurface
                key={activeTerminal.id}
                artifactContext={artifactContext}
                terminalId={activeTerminal.id}
              />
            ) : (
              <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 p-6 text-center">
                <div className="flex size-10 items-center justify-center rounded-xl border border-black/8 bg-white/72 text-black/50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/56">
                  <HugeiconsIcon
                    icon={ComputerTerminal01Icon}
                    size={18}
                    color="currentColor"
                    strokeWidth={1.8}
                  />
                </div>

                <div className="space-y-1">
                  <p className="text-sm font-medium text-black/82 dark:text-white/86">
                    {dock.isLoading ? "Opening terminal..." : "No terminal yet"}
                  </p>
                  <p className="text-sm text-black/48 dark:text-white/50">
                    {dock.isLoading
                      ? "Connecting the artifact shell."
                      : `Press ${TERMINAL_SHORTCUT_LABEL} or create a terminal to start working.`}
                  </p>
                </div>

                {!dock.isLoading ? (
                  <button
                    type="button"
                    onClick={() => {
                      void createTerminal(artifactContext).catch(() => undefined);
                    }}
                    className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-black/10 bg-white px-4 text-sm font-medium text-black transition-colors hover:bg-[#F7F6F3] dark:border-white/12 dark:bg-white/[0.04] dark:text-white dark:hover:bg-white/[0.06]"
                  >
                    <HugeiconsIcon
                      icon={Add01Icon}
                      size={16}
                      color="currentColor"
                      strokeWidth={1.8}
                    />
                    <span>New Terminal</span>
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
