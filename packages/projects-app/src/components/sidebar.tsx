'use client';
import {
  ChevronDown,
  ChevronsDownUp,
  Ellipsis,
  Folder,
  FolderPlus,
  LayoutGrid,
  LifeBuoy,
  Loader2,
  LogOut,
  MessageSquare,
  MessageSquarePlus,
  PanelLeft,
  Pencil,
  Settings,
  Smile,
  SparklesIcon,
  Trash2,
} from 'lucide-react';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import { memo, useEffect, useRef, useState } from 'react';

import type { ArtifactDirWithSessions, OverviewSession } from '@/lib/client-api';
import type { FC, FormEvent, ReactNode } from 'react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  createArtifactDir,
  deleteArtifactDir,
  deleteSession,
  getProjectOverview,
  renameSession,
} from '@/lib/client-api';
import { useTypewriter } from '@/lib/use-typewriter';
import { cn } from '@/lib/utils';
import { useChatStore, useSidebarStore, useUiStore } from '@/stores';

// ---------------------------------------------------------------------------
// SidebarItem
// ---------------------------------------------------------------------------

type SidebarItemProps = {
  icon: ReactNode;
  label: string;
  collapsed?: boolean;
  onClick?: () => void;
};

const SidebarItem: FC<SidebarItemProps> = ({ icon, label, collapsed, onClick }) => {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group flex h-10 w-full items-center whitespace-nowrap rounded-lg pl-[8px] pr-3 text-sm text-foreground hover:bg-home-hover',
        !collapsed && 'cursor-pointer gap-2'
      )}
    >
      <span className="shrink-0">{icon}</span>
      {!collapsed && <span className="flex-1 text-left text-[14px]">{label}</span>}
    </button>
  );
};

// ---------------------------------------------------------------------------
// SessionItem — a single thread inside an artifact folder
// ---------------------------------------------------------------------------

const SessionItem: FC<{
  session: OverviewSession;
  isActive: boolean;
  onSelect: (session: OverviewSession) => void;
  onRename: (session: OverviewSession, name: string) => Promise<void>;
  onDelete: (session: OverviewSession) => Promise<void>;
}> = ({ session, isActive, onSelect, onRename, onDelete }) => {
  const displayName = useTypewriter(session.sessionName);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(session.sessionName);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!isRenameOpen) return;
    setRenameValue(session.sessionName);
    setRenameError(null);
    setTimeout(() => renameInputRef.current?.focus(), 0);
  }, [isRenameOpen, session.sessionName]);

  const handleRename = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = renameValue.trim();
    if (!trimmed || isRenaming) return;

    if (trimmed === session.sessionName) {
      setIsRenameOpen(false);
      return;
    }

    setIsRenaming(true);
    setRenameError(null);
    try {
      await onRename(session, trimmed);
      setIsRenameOpen(false);
    } catch (error) {
      setRenameError(error instanceof Error ? error.message : 'Failed to rename thread');
    } finally {
      setIsRenaming(false);
    }
  };

  const handleDelete = async () => {
    if (isDeleting) return;

    setIsDeleting(true);
    setDeleteError(null);
    try {
      await onDelete(session);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Failed to delete thread');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="group">
      <div
        onClick={() => onSelect(session)}
        className={cn(
          'flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg pr-2 pl-10 text-[13px]',
          isActive ? 'bg-home-hover' : 'hover:bg-home-hover'
        )}
      >
        <MessageSquare size={13} strokeWidth={1.8} className="text-muted-foreground shrink-0" />
        <span className="flex-1 truncate text-foreground text-[13px]">{displayName}</span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity pointer-events-none hover:bg-foreground/10 hover:text-foreground group-hover:opacity-100 group-hover:pointer-events-auto data-[state=open]:opacity-100 data-[state=open]:pointer-events-auto"
              title="Thread options"
            >
              <Ellipsis size={14} strokeWidth={1.8} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="right"
            align="start"
            className="w-[150px]"
            onClick={(e) => e.stopPropagation()}
          >
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                setIsRenameOpen(true);
              }}
            >
              <Pencil size={14} />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={(e) => {
                e.stopPropagation();
                void handleDelete();
              }}
              disabled={isDeleting}
            >
              {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
        <DialogContent
          className="bg-home-page border-home-border sm:max-w-sm"
          showCloseButton={false}
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle className="text-foreground text-base">Rename thread</DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              Update the thread name.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => void handleRename(e)}>
            <input
              ref={renameInputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="bg-home-panel border-home-border text-foreground placeholder:text-muted-foreground w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-foreground/20"
              placeholder="Thread name"
            />
            {renameError && <p className="mt-2 text-xs text-red-500">{renameError}</p>}
            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsRenameOpen(false)}
                className="cursor-pointer"
                disabled={isRenaming}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="cursor-pointer"
                disabled={!renameValue.trim() || isRenaming}
              >
                {isRenaming ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {deleteError && <p className="pl-14 pr-2 pt-1 text-[11px] text-red-500">{deleteError}</p>}
    </div>
  );
};

// ---------------------------------------------------------------------------
// ArtifactGroup — a collapsible artifact folder with sessions inside
// ---------------------------------------------------------------------------

const ArtifactGroup: FC<{
  artifact: ArtifactDirWithSessions;
  projectId: string;
  activeArtifactId: string | null;
  urlThreadId: string | null;
  onDeleted: (artifactId: string) => void;
  onSessionRenamed: (sessionId: string, sessionName: string) => void;
  onSessionDeleted: (artifactId: string, sessionId: string) => void;
  defaultExpanded?: boolean;
}> = ({
  artifact,
  projectId,
  activeArtifactId,
  urlThreadId,
  onDeleted,
  onSessionRenamed,
  onSessionDeleted,
  defaultExpanded = false,
}) => {
  const router = useRouter();
  const setActiveSession = useChatStore((state) => state.setActiveSession);
  const clearSessionState = useChatStore((state) => state.clearSessionState);
  const [isCollapsed, setIsCollapsed] = useState(!defaultExpanded);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [prevDefaultExpanded, setPrevDefaultExpanded] = useState(defaultExpanded);

  if (prevDefaultExpanded !== defaultExpanded) {
    setPrevDefaultExpanded(defaultExpanded);
    if (defaultExpanded) setIsCollapsed(false);
  }

  const handleSessionSelect = (session: OverviewSession) => {
    setActiveSession({ sessionId: session.sessionId });
    router.push(`/${projectId}/${artifact.id}/${session.sessionId}`);
  };

  const handleSessionDelete = async (session: OverviewSession) => {
    await deleteSession({ projectId, artifactId: artifact.id }, session.sessionId);
    onSessionDeleted(artifact.id, session.sessionId);

    if (urlThreadId === session.sessionId) {
      clearSessionState({ sessionId: session.sessionId });
      setActiveSession(null);
      router.push(`/${projectId}/${artifact.id}`);
    }
  };

  const handleSessionRename = async (session: OverviewSession, name: string) => {
    const result = await renameSession(
      { projectId, artifactId: artifact.id },
      { sessionId: session.sessionId, name }
    );
    onSessionRenamed(result.sessionId, result.sessionName);
  };

  const handleDeleteArtifact = async () => {
    if (isDeleting) return;

    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteArtifactDir(projectId, artifact.id);
      onDeleted(artifact.id);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Failed to delete artifact');
    } finally {
      setIsDeleting(false);
    }
  };

  // Artifact row is highlighted only when on the artifact page (no thread in URL)
  const isActive = activeArtifactId === artifact.id && !urlThreadId;

  return (
    <div>
      <div
        className={cn(
          'group flex w-full items-center gap-1 whitespace-nowrap rounded-lg py-1.5 pl-2 pr-1 hover:bg-home-hover',
          isActive && 'bg-home-hover'
        )}
      >
        <div className="flex flex-1 cursor-pointer items-center gap-2 overflow-hidden">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsCollapsed(!isCollapsed);
            }}
            className="relative flex h-4 w-4 shrink-0 items-center justify-center"
          >
            <Folder
              size={16}
              strokeWidth={1.8}
              className="text-muted-foreground absolute transition-opacity duration-200 group-hover:opacity-0"
            />
            <ChevronDown
              size={14}
              strokeWidth={2}
              className={cn(
                'text-muted-foreground absolute opacity-0 transition-all duration-200 group-hover:opacity-100',
                isCollapsed && '-rotate-90'
              )}
            />
          </button>
          <button
            onClick={() => router.push(`/${projectId}/${artifact.id}`)}
            className="flex-1 cursor-pointer truncate text-left"
          >
            <span className="text-foreground truncate text-[14px]">{artifact.name}</span>
          </button>
        </div>

        {/* Hover actions: new thread + menu */}
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/${projectId}/${artifact.id}`);
            }}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
            title="New thread"
          >
            <MessageSquarePlus size={14} strokeWidth={1.8} />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
              >
                <Ellipsis size={14} strokeWidth={1.8} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start" className="w-[160px]">
              <DropdownMenuItem>
                <Pencil size={14} />
                Rename
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => void handleDeleteArtifact()}
                disabled={isDeleting}
              >
                {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {deleteError && <p className="px-2 pt-1 text-[11px] text-red-500">{deleteError}</p>}
      {!isCollapsed && artifact.sessions.length > 0 && (
        <div className="mt-1 flex flex-col gap-1">
          {artifact.sessions.map((session) => (
            <SessionItem
              key={session.sessionId}
              session={session}
              isActive={urlThreadId === session.sessionId}
              onSelect={handleSessionSelect}
              onRename={handleSessionRename}
              onDelete={handleSessionDelete}
            />
          ))}
        </div>
      )}
      {!isCollapsed && artifact.sessions.length === 0 && (
        <p className="text-muted-foreground py-1 pl-10 text-[12px]">No threads yet</p>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// ArtifactList — fetches project overview and renders artifact folders
// ---------------------------------------------------------------------------

const ArtifactList: FC<{ collapsed?: boolean; onNewArtifact?: () => void }> = ({
  collapsed,
  onNewArtifact,
}) => {
  const router = useRouter();
  const setActiveSession = useChatStore((state) => state.setActiveSession);
  const {
    projectId,
    artifactId: urlArtifactId,
    threadId: urlThreadId,
  } = useParams<{
    projectId: string;
    artifactId?: string;
    threadId?: string;
  }>();
  const artifactDirs = useSidebarStore((s) => s.artifactDirs);
  const isLoading = useSidebarStore((s) => s.isLoading);
  const renameSidebarSession = useSidebarStore((s) => s.renameSession);
  const removeSidebarSession = useSidebarStore((s) => s.removeSession);
  const setProjectName = useSidebarStore((s) => s.setProjectName);
  const setArtifactDirs = useSidebarStore((s) => s.setArtifactDirs);
  const setIsLoading = useSidebarStore((s) => s.setIsLoading);
  const [collapseAllKey, setCollapseAllKey] = useState(0);

  useEffect(() => {
    if (!projectId) return;
    setIsLoading(true);
    void getProjectOverview(projectId)
      .then((overview) => {
        setProjectName(overview.project.name);
        setArtifactDirs(overview.artifactDirs);
      })
      .catch(() => {
        setArtifactDirs([]);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [projectId, setArtifactDirs, setIsLoading]);

  const handleCollapseAll = () => setCollapseAllKey((k) => k + 1);

  const activeArtifactId = urlArtifactId ?? null;
  const handleArtifactDeleted = (artifactId: string) => {
    setArtifactDirs(artifactDirs.filter((artifact) => artifact.id !== artifactId));

    if (activeArtifactId === artifactId) {
      setActiveSession(null);
      router.push(`/${projectId}`);
    }
  };

  const handleSessionRenamed = (sessionId: string, sessionName: string) =>
    renameSidebarSession(sessionId, sessionName);
  const handleSessionDeleted = (artifactId: string, sessionId: string) =>
    removeSidebarSession(artifactId, sessionId);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!collapsed && (
        <div className="flex items-center px-3 pt-4 pb-1 mb-1">
          <span className="text-muted-foreground flex-1 text-[14px]">Artifacts</span>
          <button
            onClick={onNewArtifact}
            className="text-muted-foreground hover:text-foreground flex h-6 w-6 cursor-pointer items-center justify-center rounded-md hover:bg-home-hover"
          >
            <FolderPlus size={15} strokeWidth={1.8} />
          </button>
          <button
            onClick={handleCollapseAll}
            className="text-muted-foreground hover:text-foreground flex h-6 w-6 cursor-pointer items-center justify-center rounded-md hover:bg-home-hover"
          >
            <ChevronsDownUp size={15} strokeWidth={1.8} />
          </button>
        </div>
      )}
      {!collapsed && (
        <div className="no-scrollbar flex-1 overflow-y-auto px-2">
          {isLoading ? (
            <div className="space-y-1 px-1">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={`skel-${i}`} className="bg-home-hover/50 h-9 animate-pulse rounded-lg" />
              ))}
            </div>
          ) : artifactDirs.length === 0 ? (
            <p className="text-muted-foreground flex justify-center whitespace-nowrap py-2 mt-12 text-xs">
              No artifacts yet.
            </p>
          ) : (
            <ArtifactListInner
              artifactDirs={artifactDirs}
              projectId={projectId}
              activeArtifactId={activeArtifactId ?? null}
              urlThreadId={urlThreadId ?? null}
              collapseAllKey={collapseAllKey}
              onArtifactDeleted={handleArtifactDeleted}
              onSessionRenamed={handleSessionRenamed}
              onSessionDeleted={handleSessionDeleted}
            />
          )}
        </div>
      )}
    </div>
  );
};

const ArtifactListInner: FC<{
  artifactDirs: ArtifactDirWithSessions[];
  projectId: string;
  activeArtifactId: string | null;
  urlThreadId: string | null;
  collapseAllKey: number;
  onArtifactDeleted: (artifactId: string) => void;
  onSessionRenamed: (sessionId: string, sessionName: string) => void;
  onSessionDeleted: (artifactId: string, sessionId: string) => void;
}> = ({
  artifactDirs,
  projectId,
  activeArtifactId,
  urlThreadId,
  collapseAllKey,
  onArtifactDeleted,
  onSessionRenamed,
  onSessionDeleted,
}) => {
  // Track collapse-all resets
  const [prevKey, setPrevKey] = useState(collapseAllKey);
  const [forceCollapseKey, setForceCollapseKey] = useState(0);

  if (prevKey !== collapseAllKey) {
    setPrevKey(collapseAllKey);
    setForceCollapseKey((k) => k + 1);
  }

  return (
    <div className="flex flex-col gap-0.5">
      {artifactDirs.map((artifact) => (
        <ArtifactGroup
          key={`${artifact.id}-${forceCollapseKey}`}
          artifact={artifact}
          projectId={projectId}
          activeArtifactId={activeArtifactId}
          urlThreadId={urlThreadId}
          onDeleted={onArtifactDeleted}
          onSessionRenamed={onSessionRenamed}
          onSessionDeleted={onSessionDeleted}
          defaultExpanded={activeArtifactId === artifact.id}
        />
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// NewArtifactDialog
// ---------------------------------------------------------------------------

const NewArtifactDialog: FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onCreated: () => void;
}> = ({ open, onOpenChange, projectId, onCreated }) => {
  const [name, setName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || isCreating) return;

    setIsCreating(true);
    setError(null);
    try {
      await createArtifactDir(projectId, { name: trimmed });
      onOpenChange(false);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create artifact');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-home-page border-home-border sm:max-w-sm"
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle className="text-foreground text-base">New artifact</DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            Create a new artifact folder to organize your threads.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)}>
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-home-panel border-home-border text-foreground placeholder:text-muted-foreground w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-foreground/20"
            placeholder="Artifact name"
          />

          {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="cursor-pointer"
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button type="submit" className="cursor-pointer" disabled={!name.trim() || isCreating}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------
// AccountMenu
// ---------------------------------------------------------------------------

const AccountMenu: FC<{ collapsed?: boolean }> = ({ collapsed }) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'group flex h-10 w-full items-center whitespace-nowrap rounded-lg pl-[5px] pr-3 text-sm text-foreground hover:bg-home-hover',
            !collapsed && 'cursor-pointer gap-2'
          )}
        >
          <Avatar className="size-6">
            <AvatarFallback className="bg-muted-foreground/20 text-[10px] font-medium">
              SU
            </AvatarFallback>
          </Avatar>
          {!collapsed && <span className="flex-1 text-left text-[14px]">sugarkid</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-[240px]">
        <div className="flex items-center gap-3 px-2 py-2">
          <Avatar className="size-8">
            <AvatarFallback className="bg-muted-foreground/20 text-xs font-medium">
              SU
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="text-sm font-medium">sugarkid</span>
            <span className="text-muted-foreground text-xs">@sugarkid</span>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem>
            <SparklesIcon />
            Upgrade plan
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Smile />
            Personalization
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Settings />
            Settings
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <LifeBuoy />
              Help
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem>Documentation</DropdownMenuItem>
              <DropdownMenuItem>Support</DropdownMenuItem>
              <DropdownMenuItem>Feedback</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem>
            <LogOut />
            Log out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

function SidebarComponent() {
  const isSidebarCollapsed = useUiStore((state) => state.isSidebarCollapsed);
  const toggleSidebarCollapsed = useUiStore((state) => state.toggleSidebarCollapsed);
  const theme = useUiStore((state) => state.theme);
  const projectName = useSidebarStore((s) => s.projectName);
  const router = useRouter();
  const [isHovered, setIsHovered] = useState(false);
  const [isNewArtifactOpen, setIsNewArtifactOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const { projectId } = useParams<{ projectId: string }>();

  const logoSrc = theme === 'dark' ? '/logo-light.png' : '/logo-dark.png';
  const showToggleIcon = isSidebarCollapsed && isHovered;

  return (
    <div
      className={cn(
        'border-home-border flex h-full shrink-0 flex-col overflow-hidden border-r transition-all duration-300 ease-in-out',
        isSidebarCollapsed ? 'w-[50px] bg-home-page cursor-w-resize' : 'w-[260px] bg-home-panel'
      )}
      onMouseEnter={() => isSidebarCollapsed && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => isSidebarCollapsed && toggleSidebarCollapsed()}
    >
      {/* Header */}
      <div className="flex items-center pt-3 pb-2 pl-[9px] pr-2">
        <div className="relative flex h-8 w-8 shrink-0 items-center justify-center">
          <Image
            src={logoSrc}
            alt="logo"
            width={22}
            height={22}
            className={cn(
              'absolute transition-opacity duration-200',
              showToggleIcon ? 'opacity-0' : 'opacity-100'
            )}
          />
          <PanelLeft
            size={18}
            strokeWidth={1.8}
            className={cn(
              'text-muted-foreground absolute scale-x-[-1] transition-opacity duration-200',
              showToggleIcon ? 'opacity-100' : 'opacity-0'
            )}
          />
        </div>

        <div className="flex-1" />

        {!isSidebarCollapsed && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              setIsHovered(false);
              toggleSidebarCollapsed();
            }}
            className="cursor-pointer text-muted-foreground hover:text-foreground"
          >
            <PanelLeft size={18} strokeWidth={1.8} />
          </Button>
        )}
      </div>

      {/* Navigation items */}
      <div className="mt-2 flex flex-col gap-0.5 px-2">
        <SidebarItem
          icon={<LayoutGrid size={18} strokeWidth={1.8} />}
          label={projectName ?? projectId}
          collapsed={isSidebarCollapsed}
          onClick={() => router.push(`/${projectId}`)}
        />
      </div>

      {/* Artifact list */}
      <ArtifactList
        collapsed={isSidebarCollapsed}
        key={refreshKey}
        onNewArtifact={() => setIsNewArtifactOpen(true)}
      />

      {/* Account menu — pinned to bottom */}
      {!isSidebarCollapsed && <div className="border-home-border mx-2 border-t" />}
      <div className="px-2 pt-2 pb-3">
        <AccountMenu collapsed={isSidebarCollapsed} />
      </div>

      <NewArtifactDialog
        open={isNewArtifactOpen}
        onOpenChange={setIsNewArtifactOpen}
        projectId={projectId}
        onCreated={() => setRefreshKey((k) => k + 1)}
      />
    </div>
  );
}

export const Sidebar = memo(SidebarComponent);
