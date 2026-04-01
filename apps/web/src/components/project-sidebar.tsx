"use client";
import { useQueryClient } from "@tanstack/react-query";
import {
  AccountSetting03Icon,
  ArrowRight01Icon,
  CollapseIcon,
  Delete03Icon,
  File01Icon,
  FolderAddIcon,
  Folder01Icon,
  Key01Icon,
  MoreHorizontalIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PencilEdit02Icon,
  PencilEdit01Icon,
  ReloadIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { createPortal } from "react-dom";
import { useEffect } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { ArtifactDialogFrame } from "@/components/artifact-dialog-frame";
import { TypewriterSessionName } from "@/components/typewriter-session-name";
import {
  useArtifactDirsQuery,
  useArtifactExplorerQuery,
  useCreateArtifactDirMutation,
  useDeleteArtifactDirMutation,
  useRenameArtifactDirMutation,
} from "@/hooks/api/projects";
import {
  useDeleteSessionMutation,
  useRenameSessionMutation,
  useSessionsQuery,
} from "@/hooks/api/sessions";
import { useArtifactFilesStore } from "@/stores/artifact-files-store";
import { useChatStore } from "@/stores/chat-store";
import { useUiStore } from "@/stores/ui-store";
import { useSidebarStore } from "@/stores/sidebar-store";
import { queryKeys } from "@/lib/query-keys";

import type {
  ArtifactContext,
  ArtifactDirDto,
  ArtifactExplorerEntry,
  SessionSummaryDto,
} from "@/lib/client-api";

const MENU_WIDTH = 176;
const MENU_HEIGHT = 92;
const MENU_OFFSET = 8;
const VIEWPORT_PADDING = 12;
const ROOT_EXPANDED_DIRECTORIES: Record<string, boolean> = { "": true };

function SidebarGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden="true"
      className={className}
      fill="none"
    >
      <path
        d="M50 10 L50 90 M10 50 L90 50 M21.72 21.72 L78.28 78.28 M21.72 78.28 L78.28 21.72"
        stroke="currentColor"
        strokeWidth="22"
        strokeLinecap="round"
      />
    </svg>
  );
}

function getRecentSessions(sessions: SessionSummaryDto[]): SessionSummaryDto[] {
  return [...sessions]
    .sort((a, b) => {
      const aTime = Date.parse(a.updatedAt ?? a.createdAt);
      const bTime = Date.parse(b.updatedAt ?? b.createdAt);
      return bTime - aTime;
    })
    .slice(0, 3);
}

function normalizeRelativePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").trim();
}

function getArtifactKey(ctx: ArtifactContext): string {
  return `${ctx.projectId}::${ctx.artifactId}`;
}

function RecentThreadsSection({
  projectId,
  artifactId,
}: {
  projectId: string;
  artifactId: string;
}) {
  const router = useRouter();
  const { sessionId: activeSessionId } = useParams<{ sessionId?: string }>();
  const { data: sessions = [], isPending, isError } = useSessionsQuery({
    projectId,
    artifactId,
  });
  const recentSessions = getRecentSessions(sessions);
  const [openSessionMenuId, setOpenSessionMenuId] = useState<string | null>(null);

  return (
    <div className="shrink-0">
      <div className="flex items-center gap-2 px-3 pb-1 pt-5">
        <span className="text-[14px] text-black/38 dark:text-white/40">
          Recent Threads
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => {
            if (!activeSessionId) {
              return;
            }

            router.push(`/${projectId}/${artifactId}`);
          }}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-black/42 transition-colors hover:bg-accent hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/12 dark:text-white/44 dark:hover:bg-accent dark:hover:text-white dark:focus-visible:ring-white/12"
          aria-label="Go to artifact page"
        >
          <HugeiconsIcon
            icon={PencilEdit02Icon}
            size={16}
            color="currentColor"
            strokeWidth={1.8}
          />
        </button>
      </div>

      <div className="px-2 pb-2">
        {isPending ? (
          <div className="space-y-1 px-1 pt-1">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={`session-skeleton-${index}`}
                className="h-9 animate-pulse rounded-xl bg-accent"
              />
            ))}
          </div>
        ) : isError ? (
          <p className="mt-12 px-2 text-center text-xs text-black/42 dark:text-white/42">
            Could not load threads.
          </p>
        ) : recentSessions.length === 0 ? (
          <p className="mt-12 px-2 text-center text-xs text-black/42 dark:text-white/42">
            No threads yet.
          </p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {recentSessions.map((session) => (
              <RecentThreadRow
                key={session.sessionId}
                session={session}
                projectId={projectId}
                artifactId={artifactId}
                isActive={activeSessionId === session.sessionId}
                isMenuOpen={openSessionMenuId === session.sessionId}
                onMenuOpenChange={(isOpen) =>
                  setOpenSessionMenuId(isOpen ? session.sessionId : null)
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsSidebarSection({
  projectId,
  pathname,
}: {
  projectId: string;
  pathname: string;
}) {
  const router = useRouter();
  const generalHref = `/${projectId}/settings/general`;
  const modelsHref = `/${projectId}/settings/models`;
  const isGeneralActive = pathname === generalHref;
  const isModelsActive = pathname === modelsHref;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-3 pb-1 pt-5">
        <span className="text-[14px] text-black/38 dark:text-white/40">Settings</span>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            onClick={() => router.push(generalHref)}
            className={[
              "group flex h-10 items-center gap-2 whitespace-nowrap rounded-lg pl-2 pr-1 text-left text-[14px] font-medium transition-colors",
              isGeneralActive
                ? "bg-accent text-black dark:text-white"
                : "text-black/80 hover:bg-accent dark:text-white/82",
            ].join(" ")}
          >
            <HugeiconsIcon
              icon={AccountSetting03Icon}
              size={18}
              color="currentColor"
              strokeWidth={1.8}
              className="shrink-0 text-black/52 dark:text-white/52"
            />
            <span className="min-w-0 flex-1 truncate">General</span>
          </button>
          <button
            type="button"
            onClick={() => router.push(modelsHref)}
            className={[
              "group flex h-10 items-center gap-2 whitespace-nowrap rounded-lg pl-2 pr-1 text-left text-[14px] font-medium transition-colors",
              isModelsActive
                ? "bg-accent text-black dark:text-white"
                : "text-black/80 hover:bg-accent dark:text-white/82",
            ].join(" ")}
          >
            <HugeiconsIcon
              icon={Key01Icon}
              size={18}
              color="currentColor"
              strokeWidth={1.8}
              className="shrink-0 text-black/52 dark:text-white/52"
            />
            <span className="min-w-0 flex-1 truncate">Models</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function RecentThreadRow({
  session,
  projectId,
  artifactId,
  isActive,
  isMenuOpen,
  onMenuOpenChange,
}: {
  session: SessionSummaryDto;
  projectId: string;
  artifactId: string;
  isActive: boolean;
  isMenuOpen: boolean;
  onMenuOpenChange: (isOpen: boolean) => void;
}) {
  const router = useRouter();

  return (
    <div
      onClick={() => router.push(`/${projectId}/${artifactId}/${session.sessionId}`)}
      className={[
        "group flex h-10 cursor-pointer items-center gap-2 rounded-lg pl-2 pr-1 whitespace-nowrap text-[14px] font-medium transition-colors",
        isActive || isMenuOpen
          ? "bg-accent text-black dark:text-white"
          : "text-black/80 hover:bg-accent dark:text-white/82",
      ].join(" ")}
    >
      <TypewriterSessionName
        name={session.sessionName}
        className="min-w-0 flex-1 truncate"
      />
      <RecentThreadActionsMenu
        session={session}
        projectId={projectId}
        artifactId={artifactId}
        onMenuOpenChange={onMenuOpenChange}
      />
    </div>
  );
}

function FileTreeRows({
  ctx,
  path,
  depth,
  expandedDirectories,
  onToggleDirectory,
  selectedFilePath,
  onSelectFile,
}: {
  ctx: ArtifactContext;
  path: string;
  depth: number;
  expandedDirectories: Record<string, boolean>;
  onToggleDirectory: (path: string) => void;
  selectedFilePath: string | null;
  onSelectFile: (path: string) => void;
}) {
  const safePath = normalizeRelativePath(path);
  const { data: listing, isPending, isError, error } = useArtifactExplorerQuery(ctx, safePath);

  if (isPending && !listing) {
    return (
      <p
        className="py-2 text-xs text-black/42 dark:text-white/42"
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        Loading files...
      </p>
    );
  }

  if (isError) {
    return (
      <p
        className="py-2 text-xs text-[#FF6363]"
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        {error instanceof Error ? error.message : "Could not load files."}
      </p>
    );
  }

  if (!listing) {
    return null;
  }

  if (listing.entries.length === 0 && safePath.length === 0) {
    return null;
  }

  return (
    <>
      {listing.entries.map((entry) =>
        entry.type === "directory" ? (
          <FileTreeDirectoryRow
            key={entry.path}
            ctx={ctx}
            entry={entry}
            depth={depth}
            expandedDirectories={expandedDirectories}
            onToggleDirectory={onToggleDirectory}
            selectedFilePath={selectedFilePath}
            onSelectFile={onSelectFile}
          />
        ) : (
          <FileTreeFileRow
            key={entry.path}
            entry={entry}
            depth={depth}
            isSelected={selectedFilePath === entry.path}
            onSelectFile={onSelectFile}
          />
        ),
      )}
    </>
  );
}

function FileTreeDirectoryRow({
  ctx,
  entry,
  depth,
  expandedDirectories,
  onToggleDirectory,
  selectedFilePath,
  onSelectFile,
}: {
  ctx: ArtifactContext;
  entry: ArtifactExplorerEntry;
  depth: number;
  expandedDirectories: Record<string, boolean>;
  onToggleDirectory: (path: string) => void;
  selectedFilePath: string | null;
  onSelectFile: (path: string) => void;
}) {
  const isExpanded = expandedDirectories[entry.path] ?? false;

  return (
    <div>
      <div className="py-0.5" style={{ paddingLeft: `${depth * 12}px` }}>
        <button
          type="button"
          onClick={() => onToggleDirectory(entry.path)}
          className="group flex h-9 w-full items-center gap-1 rounded-lg px-2 pr-1 text-left text-[13px] font-medium text-black/80 transition-colors hover:bg-accent dark:text-white/82"
        >
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            size={12}
            color="currentColor"
            strokeWidth={1.8}
            className={[
              "shrink-0 text-black/42 transition-transform dark:text-white/42",
              isExpanded ? "rotate-90" : "rotate-0",
            ].join(" ")}
          />
          <HugeiconsIcon
            icon={Folder01Icon}
            size={15}
            color="currentColor"
            strokeWidth={1.8}
            className="shrink-0 text-black/52 dark:text-white/52"
          />
          <span className="min-w-0 flex-1 truncate">{entry.name}</span>
        </button>
      </div>

      {isExpanded ? (
        <FileTreeRows
          ctx={ctx}
          path={entry.path}
          depth={depth + 1}
          expandedDirectories={expandedDirectories}
          onToggleDirectory={onToggleDirectory}
          selectedFilePath={selectedFilePath}
          onSelectFile={onSelectFile}
        />
      ) : null}
    </div>
  );
}

function FileTreeFileRow({
  entry,
  depth,
  isSelected,
  onSelectFile,
}: {
  entry: ArtifactExplorerEntry;
  depth: number;
  isSelected: boolean;
  onSelectFile: (path: string) => void;
}) {
  return (
    <div className="py-0.5" style={{ paddingLeft: `${18 + depth * 12}px` }}>
      <button
        type="button"
        onClick={() => onSelectFile(entry.path)}
        className={[
          "group flex h-9 w-full items-center gap-1 rounded-lg px-2 pr-1 text-left text-[13px] font-medium transition-colors",
          isSelected
            ? "bg-accent text-black dark:text-white"
            : "text-black/74 hover:bg-accent dark:text-white/76",
        ].join(" ")}
      >
        <HugeiconsIcon
          icon={File01Icon}
          size={14}
          color="currentColor"
          strokeWidth={1.8}
          className="shrink-0 text-black/48 dark:text-white/48"
        />
        <span className="min-w-0 flex-1 truncate">{entry.name}</span>
      </button>
    </div>
  );
}

function FilesSection({
  projectId,
  artifactId,
}: {
  projectId: string;
  artifactId: string;
}) {
  const queryClient = useQueryClient();
  const artifactContext = {
    projectId,
    artifactId,
  };
  const artifactKey = getArtifactKey(artifactContext);
  const [isOpen, setIsOpen] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedDirectories, setExpandedDirectories] = useState<Record<string, boolean>>(
    ROOT_EXPANDED_DIRECTORIES,
  );
  const selectedFilePath = useArtifactFilesStore(
    (state) => state.selectedFileByArtifact[artifactKey] ?? null,
  );
  const closePreview = useArtifactFilesStore((state) => state.closePreview);
  const openFile = useArtifactFilesStore((state) => state.openFile);

  useEffect(() => {
    closePreview({ projectId, artifactId });
  }, [artifactId, closePreview, projectId]);

  function toggleDirectory(path: string) {
    const safePath = normalizeRelativePath(path);
    setExpandedDirectories((current) => ({
      ...current,
      [safePath]: !(current[safePath] ?? false),
    }));
  }

  function collapseAllDirectories() {
    setExpandedDirectories(ROOT_EXPANDED_DIRECTORIES);
  }

  async function refreshFiles() {
    if (isRefreshing) {
      return;
    }

    setIsRefreshing(true);

    try {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.artifacts.scope(artifactContext),
      });
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-3 pb-1 pt-5">
        <button
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-black/42 transition-colors hover:bg-accent hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/12 dark:text-white/44 dark:hover:bg-accent dark:hover:text-white dark:focus-visible:ring-white/12"
          aria-label={isOpen ? "Collapse files section" : "Expand files section"}
        >
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            size={16}
            color="currentColor"
            strokeWidth={1.8}
            className={[
              "shrink-0 transition-transform",
              isOpen ? "rotate-90" : "rotate-0",
            ].join(" ")}
          />
        </button>
        <span className="text-[14px] text-black/38 dark:text-white/40">Files</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => {
            void refreshFiles();
          }}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-black/42 transition-colors hover:bg-accent hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/12 disabled:pointer-events-none disabled:opacity-60 dark:text-white/44 dark:hover:bg-accent dark:hover:text-white dark:focus-visible:ring-white/12"
          aria-label="Reload files"
          disabled={isRefreshing}
        >
          <HugeiconsIcon
            icon={ReloadIcon}
            size={15}
            color="currentColor"
            strokeWidth={1.8}
            className={isRefreshing ? "animate-spin" : undefined}
          />
        </button>
        <button
          type="button"
          onClick={collapseAllDirectories}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-black/42 transition-colors hover:bg-accent hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/12 dark:text-white/44 dark:hover:bg-accent dark:hover:text-white dark:focus-visible:ring-white/12"
          aria-label="Collapse all folders"
        >
          <HugeiconsIcon
            icon={CollapseIcon}
            size={15}
            color="currentColor"
            strokeWidth={1.8}
          />
        </button>
      </div>

      {isOpen ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          <FileTreeRows
            ctx={artifactContext}
            path=""
            depth={0}
            expandedDirectories={expandedDirectories}
            onToggleDirectory={toggleDirectory}
            selectedFilePath={selectedFilePath}
            onSelectFile={(path) => {
              void openFile(artifactContext, path);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function ArtifactActionsMenu({
  artifact,
  projectId,
  isMenuOpen,
  onMenuOpenChange,
}: {
  artifact: ArtifactDirDto;
  projectId: string;
  isMenuOpen: boolean;
  onMenuOpenChange: (isOpen: boolean) => void;
}) {
  const artifactContext: ArtifactContext = {
    projectId,
    artifactId: artifact.id,
  };
  const renameArtifact = useRenameArtifactDirMutation(artifactContext);
  const deleteArtifact = useDeleteArtifactDirMutation(artifactContext);
  const [isOpen, setIsOpen] = useState(false);
  const [activeDialog, setActiveDialog] = useState<"rename" | "delete" | null>(null);
  const [renameValue, setRenameValue] = useState(artifact.name);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(
    null,
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  function updateMenuPosition() {
    if (typeof window === "undefined" || !triggerRef.current) {
      return;
    }

    const rect = triggerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const shouldOpenAbove =
      viewportHeight - rect.bottom < MENU_HEIGHT + MENU_OFFSET &&
      rect.top > MENU_HEIGHT + MENU_OFFSET;

    const top = shouldOpenAbove
      ? Math.max(VIEWPORT_PADDING, rect.top - MENU_HEIGHT - MENU_OFFSET)
      : Math.min(
          viewportHeight - MENU_HEIGHT - VIEWPORT_PADDING,
          rect.bottom + MENU_OFFSET,
        );
    const preferredLeft = rect.right + MENU_OFFSET;
    const left =
      preferredLeft + MENU_WIDTH <= viewportWidth - VIEWPORT_PADDING
        ? preferredLeft
        : Math.max(
            VIEWPORT_PADDING,
            Math.min(rect.left - MENU_WIDTH - MENU_OFFSET, viewportWidth - MENU_WIDTH - VIEWPORT_PADDING),
          );

    setMenuPosition({ top, left });
  }

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }

      setIsOpen(false);
      onMenuOpenChange(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        onMenuOpenChange(false);
      }
    }

    function handleViewportChange() {
      updateMenuPosition();
    }

    const frame = window.requestAnimationFrame(() => {
      updateMenuPosition();
    });
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [isOpen, onMenuOpenChange]);

  useEffect(() => {
    if (activeDialog !== "rename") {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [activeDialog, artifact.name]);

  const items = [
    { label: "Rename", icon: PencilEdit01Icon, action: "rename" },
    { label: "Delete", icon: Delete03Icon, action: "delete" },
  ] as const;

  async function handleRename() {
    const trimmedName = renameValue.trim();
    if (!trimmedName || renameArtifact.isPending) {
      return;
    }

    if (trimmedName === artifact.name) {
      setActiveDialog(null);
      return;
    }

    try {
      await renameArtifact.mutateAsync({ name: trimmedName });
      toast.success("Artifact renamed.");
      setActiveDialog(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to rename artifact.");
    }
  }

  async function handleDelete() {
    if (deleteArtifact.isPending) {
      return;
    }

    try {
      await deleteArtifact.mutateAsync();
      toast.success("Artifact deleted.");
      setActiveDialog(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete artifact.");
    }
  }

  return (
    <div className="shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label={`More options for ${artifact.name}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={(event) => {
          event.stopPropagation();
          if (isOpen) {
            setIsOpen(false);
            onMenuOpenChange(false);
            return;
          }

          updateMenuPosition();
          setIsOpen(true);
          onMenuOpenChange(true);
        }}
        className={[
          "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-black/42 transition-all hover:bg-accent hover:text-black dark:text-white/44 dark:hover:bg-accent dark:hover:text-white",
          isMenuOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100",
        ].join(" ")}
      >
        <HugeiconsIcon
          icon={MoreHorizontalIcon}
          size={16}
          color="currentColor"
          strokeWidth={1.8}
        />
      </button>

      {isOpen && menuPosition && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label={`Actions for ${artifact.name}`}
              className="fixed z-50 w-44 overflow-hidden rounded-2xl border border-black/8 bg-white p-1.5 shadow-[0_16px_44px_rgba(0,0,0,0.08)] dark:border-white/10 dark:bg-[#171717] dark:shadow-[0_16px_44px_rgba(0,0,0,0.3)]"
              style={{
                top: menuPosition.top,
                left: menuPosition.left,
              }}
            >
              {items.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsOpen(false);
                    onMenuOpenChange(false);
                    if (item.action === "rename") {
                      setRenameValue(artifact.name);
                    }
                    setActiveDialog(item.action);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[0.83rem] font-medium text-black/78 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/12 dark:text-white/82 dark:focus-visible:ring-white/12"
                >
                  <HugeiconsIcon
                    icon={item.icon}
                    size={16}
                    color="#FF6363"
                    strokeWidth={1.8}
                  />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}

      {activeDialog === "rename" ? (
        <ArtifactDialogFrame
          title="Rename artifact"
          description="Update the artifact name."
          onClose={() => {
            if (renameArtifact.isPending) {
              return;
            }

            setActiveDialog(null);
          }}
          footer={
            <>
              <button
                type="button"
                onClick={() => setActiveDialog(null)}
                disabled={renameArtifact.isPending}
                className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-medium text-black/56 transition-colors hover:bg-accent hover:text-black disabled:cursor-not-allowed disabled:opacity-60 dark:text-white/58 dark:hover:bg-accent dark:hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleRename()}
                disabled={!renameValue.trim() || renameArtifact.isPending}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-[#FF6363] px-4 text-sm font-medium text-white transition-opacity hover:opacity-92 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {renameArtifact.isPending ? "Saving..." : "Confirm"}
              </button>
            </>
          }
        >
          <input
            ref={renameInputRef}
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void handleRename();
              }
            }}
            placeholder="Artifact name"
            className="w-full rounded-2xl border border-black/8 bg-transparent px-4 py-3 text-sm text-black outline-none transition focus:border-black/14 focus:ring-2 focus:ring-black/10 dark:border-white/10 dark:text-white dark:focus:border-white/18 dark:focus:ring-white/10"
          />
        </ArtifactDialogFrame>
      ) : null}

      {activeDialog === "delete" ? (
        <ArtifactDialogFrame
          title="Delete artifact"
          description="This Action cannot be reversed."
          onClose={() => {
            if (deleteArtifact.isPending) {
              return;
            }

            setActiveDialog(null);
          }}
          footer={
            <>
              <button
                type="button"
                onClick={() => setActiveDialog(null)}
                disabled={deleteArtifact.isPending}
                className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-medium text-black/56 transition-colors hover:bg-accent hover:text-black disabled:cursor-not-allowed disabled:opacity-60 dark:text-white/58 dark:hover:bg-accent dark:hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleteArtifact.isPending}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-[#FF6363] px-4 text-sm font-medium text-white transition-opacity hover:opacity-92 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleteArtifact.isPending ? "Deleting..." : "Confirm"}
              </button>
            </>
          }
        />
      ) : null}
    </div>
  );
}

function RecentThreadActionsMenu({
  session,
  projectId,
  artifactId,
  onMenuOpenChange,
}: {
  session: SessionSummaryDto;
  projectId: string;
  artifactId: string;
  onMenuOpenChange: (isOpen: boolean) => void;
}) {
  const router = useRouter();
  const { sessionId: activeSessionId } = useParams<{ sessionId?: string }>();
  const artifactContext: ArtifactContext = {
    projectId,
    artifactId,
  };
  const renameSession = useRenameSessionMutation(artifactContext);
  const deleteSession = useDeleteSessionMutation(artifactContext, session.sessionId);
  const sidebarRenameSession = useSidebarStore((state) => state.renameSession);
  const sidebarRemoveSession = useSidebarStore((state) => state.removeSession);
  const clearSessionState = useChatStore((state) => state.clearSessionState);
  const setActiveSession = useChatStore((state) => state.setActiveSession);
  const [isOpen, setIsOpen] = useState(false);
  const [activeDialog, setActiveDialog] = useState<"rename" | "delete" | null>(null);
  const [renameValue, setRenameValue] = useState(session.sessionName);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(
    null,
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  function updateMenuPosition() {
    if (typeof window === "undefined" || !triggerRef.current) {
      return;
    }

    const rect = triggerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const shouldOpenAbove =
      viewportHeight - rect.bottom < MENU_HEIGHT + MENU_OFFSET &&
      rect.top > MENU_HEIGHT + MENU_OFFSET;

    const top = shouldOpenAbove
      ? Math.max(VIEWPORT_PADDING, rect.top - MENU_HEIGHT - MENU_OFFSET)
      : Math.min(
          viewportHeight - MENU_HEIGHT - VIEWPORT_PADDING,
          rect.bottom + MENU_OFFSET,
        );
    const preferredLeft = rect.right + MENU_OFFSET;
    const left =
      preferredLeft + MENU_WIDTH <= viewportWidth - VIEWPORT_PADDING
        ? preferredLeft
        : Math.max(
            VIEWPORT_PADDING,
            Math.min(
              rect.left - MENU_WIDTH - MENU_OFFSET,
              viewportWidth - MENU_WIDTH - VIEWPORT_PADDING,
            ),
          );

    setMenuPosition({ top, left });
  }

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }

      setIsOpen(false);
      onMenuOpenChange(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        onMenuOpenChange(false);
      }
    }

    function handleViewportChange() {
      updateMenuPosition();
    }

    const frame = window.requestAnimationFrame(() => {
      updateMenuPosition();
    });
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [isOpen, onMenuOpenChange]);

  useEffect(() => {
    if (activeDialog !== "rename") {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [activeDialog, session.sessionName]);

  const items = [
    { label: "Rename", icon: PencilEdit01Icon, action: "rename" },
    { label: "Delete", icon: Delete03Icon, action: "delete" },
  ] as const;

  async function handleRename() {
    const trimmedName = renameValue.trim();
    if (!trimmedName || renameSession.isPending) {
      return;
    }

    if (trimmedName === session.sessionName) {
      setActiveDialog(null);
      return;
    }

    try {
      const response = await renameSession.mutateAsync({
        sessionId: session.sessionId,
        name: trimmedName,
      });
      sidebarRenameSession(session.sessionId, response.sessionName);
      toast.success("Thread renamed.");
      setActiveDialog(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to rename thread.");
    }
  }

  async function handleDelete() {
    if (deleteSession.isPending) {
      return;
    }

    try {
      await deleteSession.mutateAsync();
      sidebarRemoveSession(artifactId, session.sessionId);
      clearSessionState({ sessionId: session.sessionId });

      if (activeSessionId === session.sessionId) {
        setActiveSession(null);
        router.push(`/${projectId}/${artifactId}`);
      }

      toast.success("Thread deleted.");
      setActiveDialog(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete thread.");
    }
  }

  return (
    <div className="shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label={`More options for ${session.sessionName}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.stopPropagation();
          if (isOpen) {
            setIsOpen(false);
            onMenuOpenChange(false);
            return;
          }

          updateMenuPosition();
          setIsOpen(true);
          onMenuOpenChange(true);
        }}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-black/42 transition-all hover:bg-accent hover:text-black dark:text-white/44 dark:hover:bg-accent dark:hover:text-white"
      >
        <HugeiconsIcon
          icon={MoreHorizontalIcon}
          size={16}
          color="currentColor"
          strokeWidth={1.8}
        />
      </button>

      {isOpen && menuPosition && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label={`Actions for ${session.sessionName}`}
              className="fixed z-50 w-44 overflow-hidden rounded-2xl border border-black/8 bg-white p-1.5 shadow-[0_16px_44px_rgba(0,0,0,0.08)] dark:border-white/10 dark:bg-[#171717] dark:shadow-[0_16px_44px_rgba(0,0,0,0.3)]"
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.stopPropagation();
              }}
              style={{
                top: menuPosition.top,
                left: menuPosition.left,
              }}
            >
              {items.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    setIsOpen(false);
                    onMenuOpenChange(false);
                    if (item.action === "rename") {
                      setRenameValue(session.sessionName);
                    }
                    setActiveDialog(item.action);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[0.83rem] font-medium text-black/78 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/12 dark:text-white/82 dark:focus-visible:ring-white/12"
                >
                  <HugeiconsIcon
                    icon={item.icon}
                    size={16}
                    color="#FF6363"
                    strokeWidth={1.8}
                  />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}

      {activeDialog === "rename" ? (
        <ArtifactDialogFrame
          title="Rename thread"
          description="Update the thread name."
          onClose={() => {
            if (renameSession.isPending) {
              return;
            }

            setActiveDialog(null);
          }}
          footer={
            <>
              <button
                type="button"
                onClick={() => setActiveDialog(null)}
                disabled={renameSession.isPending}
                className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-medium text-black/56 transition-colors hover:bg-accent hover:text-black disabled:cursor-not-allowed disabled:opacity-60 dark:text-white/58 dark:hover:bg-accent dark:hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleRename()}
                disabled={!renameValue.trim() || renameSession.isPending}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-[#FF6363] px-4 text-sm font-medium text-white transition-opacity hover:opacity-92 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {renameSession.isPending ? "Saving..." : "Confirm"}
              </button>
            </>
          }
        >
          <input
            ref={renameInputRef}
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void handleRename();
              }
            }}
            placeholder="Thread name"
            className="w-full rounded-2xl border border-black/8 bg-transparent px-4 py-3 text-sm text-black outline-none transition focus:border-black/14 focus:ring-2 focus:ring-black/10 dark:border-white/10 dark:text-white dark:focus:border-white/18 dark:focus:ring-white/10"
          />
        </ArtifactDialogFrame>
      ) : null}

      {activeDialog === "delete" ? (
        <ArtifactDialogFrame
          title="Delete thread"
          description="This Action cannot be reversed."
          onClose={() => {
            if (deleteSession.isPending) {
              return;
            }

            setActiveDialog(null);
          }}
          footer={
            <>
              <button
                type="button"
                onClick={() => setActiveDialog(null)}
                disabled={deleteSession.isPending}
                className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-medium text-black/56 transition-colors hover:bg-accent hover:text-black disabled:cursor-not-allowed disabled:opacity-60 dark:text-white/58 dark:hover:bg-accent dark:hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleteSession.isPending}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-[#FF6363] px-4 text-sm font-medium text-white transition-opacity hover:opacity-92 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleteSession.isPending ? "Deleting..." : "Confirm"}
              </button>
            </>
          }
        />
      ) : null}
    </div>
  );
}

export function ProjectSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { projectId, artifactId } = useParams<{
    projectId: string;
    artifactId?: string;
  }>();
  const { data: artifacts = [], isPending } = useArtifactDirsQuery(projectId);
  const createArtifact = useCreateArtifactDirMutation(projectId);
  const isSidebarCollapsed = useUiStore((state) => state.isSidebarCollapsed);
  const toggleSidebarCollapsed = useUiStore((state) => state.toggleSidebarCollapsed);
  const [isHovered, setIsHovered] = useState(false);
  const [openArtifactMenuId, setOpenArtifactMenuId] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const createInputRef = useRef<HTMLInputElement>(null);
  const isSettingsRoute = pathname === `/${projectId}/settings` || pathname.startsWith(`/${projectId}/settings/`);

  const showToggleIcon = isSidebarCollapsed && isHovered;

  useEffect(() => {
    if (!isCreateDialogOpen) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      createInputRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [isCreateDialogOpen]);

  async function handleCreateArtifact() {
    const trimmedName = createName.trim();
    if (!trimmedName || createArtifact.isPending) {
      return;
    }

    try {
      const artifact = await createArtifact.mutateAsync({ name: trimmedName });
      toast.success("Artifact created.");
      setIsCreateDialogOpen(false);
      setCreateName("");
      router.push(`/${projectId}/${artifact.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create artifact.");
    }
  }

  return (
    <aside
      className={[
        "flex h-full shrink-0 flex-col overflow-hidden border-r transition-all duration-300 ease-in-out",
        "border-black/6 bg-[#FCFBFC] dark:border-white/8 dark:bg-[#0E0E0E]",
        isSidebarCollapsed ? "w-[50px] cursor-w-resize" : "w-[260px]",
      ].join(" ")}
      onMouseEnter={() => {
        if (isSidebarCollapsed) {
          setIsHovered(true);
        }
      }}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => {
        if (isSidebarCollapsed) {
          toggleSidebarCollapsed();
        }
      }}
      aria-label="Project sidebar"
    >
      <div className="flex h-12 items-center pl-[9px] pr-2">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            router.push("/");
          }}
          className="group/logo relative flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center text-[0.82rem] font-medium text-black/72 transition-colors hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/12 dark:text-white/76 dark:hover:text-white dark:focus-visible:ring-white/12"
          aria-label="Go to home page"
          title="Go to home page"
        >
          <div
            className={[
              "relative flex h-[18px] w-[18px] items-center justify-center transition-transform duration-[1000ms] ease-out",
              isSidebarCollapsed ? "rotate-[90deg]" : "rotate-0",
            ].join(" ")}
          >
            <SidebarGlyph
              className={[
                "absolute h-[18px] w-[18px] text-black transition-[opacity,transform] duration-200 group-hover/logo:animate-spin dark:text-white",
                showToggleIcon ? "opacity-0" : "opacity-100",
              ].join(" ")}
            />
            <HugeiconsIcon
              icon={PanelLeftOpenIcon}
              size={18}
              color="currentColor"
              strokeWidth={1.8}
              className={[
                "absolute rotate-[90deg] text-black/58 transition-[opacity,transform] duration-200 dark:text-white/62",
                showToggleIcon ? "opacity-100" : "opacity-0",
              ].join(" ")}
            />
          </div>
        </button>

        {!isSidebarCollapsed ? (
          <>
            <div className="flex-1" />
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setIsHovered(false);
                toggleSidebarCollapsed();
              }}
              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-black/54 transition-colors hover:bg-black/[0.045] hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/12 dark:text-white/58 dark:hover:bg-white/[0.05] dark:hover:text-white dark:focus-visible:ring-white/12"
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <HugeiconsIcon
                icon={PanelLeftCloseIcon}
                size={18}
                color="currentColor"
                strokeWidth={1.8}
                className="rotate-180"
              />
            </button>
          </>
        ) : null}
      </div>

      {!isSidebarCollapsed && artifactId ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <RecentThreadsSection projectId={projectId} artifactId={artifactId} />
          <FilesSection
            key={`${projectId}:${artifactId}`}
            projectId={projectId}
            artifactId={artifactId}
          />
        </div>
      ) : null}

      {!isSidebarCollapsed && !artifactId && isSettingsRoute ? (
        <SettingsSidebarSection projectId={projectId} pathname={pathname} />
      ) : null}

      {!isSidebarCollapsed && !artifactId && !isSettingsRoute ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-2 px-3 pb-1 pt-5">
            <span className="text-[14px] text-black/38 dark:text-white/40">
              Artifacts
            </span>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => {
                setCreateName("");
                setIsCreateDialogOpen(true);
              }}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-black/42 transition-colors hover:bg-accent hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/12 dark:text-white/44 dark:hover:bg-accent dark:hover:text-white dark:focus-visible:ring-white/12"
              aria-label="Create artifact"
              title="Create artifact"
            >
              <HugeiconsIcon
                icon={FolderAddIcon}
                size={16}
                color="currentColor"
                strokeWidth={1.8}
              />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-2 pb-3">
            {isPending ? (
              <div className="space-y-1 px-1 pt-1">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={`artifact-skeleton-${index}`}
                    className="h-9 animate-pulse rounded-xl bg-accent"
                  />
                ))}
              </div>
            ) : artifacts.length === 0 ? (
              <p className="mt-12 px-2 text-center text-xs text-black/42 dark:text-white/42">
                No artifacts yet.
              </p>
            ) : (
              <div className="flex flex-col gap-0.5">
                {artifacts.map((artifact) => (
                  <div
                    key={artifact.id}
                    className={[
                      "group flex h-10 items-center gap-2 whitespace-nowrap rounded-lg pl-2 pr-1 text-[14px] font-medium text-black/80 transition-colors dark:text-white/82",
                      openArtifactMenuId === artifact.id || artifactId === artifact.id
                        ? "bg-accent"
                        : "hover:bg-accent",
                    ].join(" ")}
                    onClick={() => router.push(`/${projectId}/${artifact.id}`)}
                  >
                    <HugeiconsIcon
                      icon={Folder01Icon}
                      size={18}
                      color="currentColor"
                      strokeWidth={1.8}
                      className="shrink-0 text-black/52 dark:text-white/52"
                    />
                    <span className="min-w-0 flex-1 truncate">{artifact.name}</span>
                    <ArtifactActionsMenu
                      artifact={artifact}
                      projectId={projectId}
                      isMenuOpen={openArtifactMenuId === artifact.id}
                      onMenuOpenChange={(isOpen) => {
                        setOpenArtifactMenuId(isOpen ? artifact.id : null);
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {isCreateDialogOpen ? (
            <ArtifactDialogFrame
              title="Create artifact"
              description="Create a new artifact folder."
              onClose={() => {
                if (createArtifact.isPending) {
                  return;
                }

                setIsCreateDialogOpen(false);
              }}
              footer={
                <>
                  <button
                    type="button"
                    onClick={() => setIsCreateDialogOpen(false)}
                    disabled={createArtifact.isPending}
                    className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-medium text-black/56 transition-colors hover:bg-accent hover:text-black disabled:cursor-not-allowed disabled:opacity-60 dark:text-white/58 dark:hover:bg-accent dark:hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCreateArtifact()}
                    disabled={!createName.trim() || createArtifact.isPending}
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-[#FF6363] px-4 text-sm font-medium text-white transition-opacity hover:opacity-92 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {createArtifact.isPending ? "Creating..." : "Create"}
                  </button>
                </>
              }
            >
              <input
                ref={createInputRef}
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleCreateArtifact();
                  }
                }}
                placeholder="Artifact name"
                className="w-full rounded-2xl border border-black/8 bg-transparent px-4 py-3 text-sm text-black outline-none transition focus:border-black/14 focus:ring-2 focus:ring-black/10 dark:border-white/10 dark:text-white dark:focus:border-white/18 dark:focus:ring-white/10"
              />
            </ArtifactDialogFrame>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
