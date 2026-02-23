'use client';
import {
  Archive,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  Ellipsis,
  Folder,
  FolderPlus,
  GitBranch,
  PanelLeft,
  Pen,
  Pin,
  Settings,
  Share,
  SquarePen,
  Trash2,
} from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { memo, useEffect, useMemo, useState } from 'react';

import type { MockBranch, MockProject, MockThread } from '@/lib/mock-data';
import type { FC, ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { branchToSlug } from '@/lib/mock-data';
import { cn } from '@/lib/utils';
import { useProjectsStore, useUiStore } from '@/stores';

// ---------------------------------------------------------------------------
// Route context — parsed from the current URL
// ---------------------------------------------------------------------------

type RouteContext = {
  projectName: string | null;
  branchSlug: string | null;
  threadId: string | null;
};

function useRouteContext(): RouteContext {
  const pathname = usePathname();
  return useMemo(() => {
    const segments = pathname.split('/').filter(Boolean);
    return {
      projectName: segments[0] ?? null,
      branchSlug: segments[1] ?? null,
      threadId: segments[2] ?? null,
    };
  }, [pathname]);
}

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
// ThreadItem
// ---------------------------------------------------------------------------

const ThreadItem: FC<{
  thread: MockThread;
  isActive: boolean;
  onSelect: (thread: MockThread) => void;
}> = ({ thread, isActive, onSelect }) => {
  return (
    <div
      onClick={() => onSelect(thread)}
      className={cn(
        'flex h-8 w-full cursor-pointer items-center rounded-lg pr-2 pl-10 text-[13px]',
        isActive ? 'bg-home-hover' : 'hover:bg-home-hover'
      )}
    >
      <span className="flex-1 truncate text-foreground text-[13px]">{thread.threadName}</span>
      <span className="text-muted-foreground ml-2 shrink-0 text-[12px]">{thread.age}</span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// BranchGroup — a single branch with its threads
// ---------------------------------------------------------------------------

const BranchGroup: FC<{
  branch: MockBranch;
  projectName: string;
  activeThreadId: string | null;
  defaultExpanded?: boolean;
}> = ({ branch, projectName, activeThreadId, defaultExpanded = false }) => {
  const router = useRouter();
  const [isCollapsed, setIsCollapsed] = useState(!defaultExpanded);
  const [prevDefaultExpanded, setPrevDefaultExpanded] = useState(defaultExpanded);

  if (prevDefaultExpanded !== defaultExpanded) {
    setPrevDefaultExpanded(defaultExpanded);
    if (defaultExpanded) setIsCollapsed(false);
  }

  const handleThreadSelect = (thread: MockThread) => {
    router.push(`/${projectName}/${branchToSlug(branch.branchName)}/${thread.threadId}`);
  };

  return (
    <div>
      <div className="group flex h-8 w-full items-center rounded-lg py-1 pl-6 pr-1 hover:bg-home-hover">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex flex-1 cursor-pointer items-center gap-1.5 overflow-hidden"
        >
          <ChevronRight
            size={12}
            strokeWidth={2}
            className={cn(
              'text-muted-foreground shrink-0 transition-transform duration-200',
              !isCollapsed && 'rotate-90'
            )}
          />
          <GitBranch size={14} strokeWidth={1.8} className="text-muted-foreground shrink-0" />
          <span className="text-foreground truncate text-[13px]">{branch.branchName}</span>
        </button>
        <button className="text-muted-foreground hover:text-foreground flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-md opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          <SquarePen size={13} strokeWidth={1.8} />
        </button>
      </div>
      {!isCollapsed && branch.threads.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {branch.threads.map((thread) => (
            <ThreadItem
              key={thread.threadId}
              thread={thread}
              isActive={activeThreadId === thread.threadId}
              onSelect={handleThreadSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// ProjectGroup — a project folder with active/merged branch sections
// ---------------------------------------------------------------------------

const ProjectGroup: FC<{
  project: MockProject;
  routeCtx: RouteContext;
  collapseAllKey: number;
}> = ({ project, routeCtx, collapseAllKey }) => {
  const router = useRouter();
  const hasBranches = project.branches.length > 0;

  const isRouteProject = routeCtx.projectName === project.projectName;
  const activeBranch = routeCtx.branchSlug ?? null;

  const activeBranches = project.branches.filter((b) => b.status === 'active');
  const mergedBranches = project.branches.filter((b) => b.status === 'merged');

  // Auto-expand if this project is in the current route
  const hasActiveMergedBranch =
    isRouteProject &&
    activeBranch !== null &&
    mergedBranches.some((b) => branchToSlug(b.branchName) === activeBranch);

  const [isCollapsed, setIsCollapsed] = useState(!hasBranches && !isRouteProject);
  const [isMergedExpanded, setIsMergedExpanded] = useState(hasActiveMergedBranch);

  const [prevCollapseAllKey, setPrevCollapseAllKey] = useState(collapseAllKey);
  if (prevCollapseAllKey !== collapseAllKey) {
    setPrevCollapseAllKey(collapseAllKey);
    if (collapseAllKey > 0) {
      setIsCollapsed(true);
      setIsMergedExpanded(false);
    }
  }

  const [prevIsRouteProject, setPrevIsRouteProject] = useState(isRouteProject);
  if (prevIsRouteProject !== isRouteProject) {
    setPrevIsRouteProject(isRouteProject);
    if (isRouteProject) setIsCollapsed(false);
  }

  const [prevHasActiveMergedBranch, setPrevHasActiveMergedBranch] = useState(hasActiveMergedBranch);
  if (prevHasActiveMergedBranch !== hasActiveMergedBranch) {
    setPrevHasActiveMergedBranch(hasActiveMergedBranch);
    if (hasActiveMergedBranch) setIsMergedExpanded(true);
  }

  return (
    <div>
      <DropdownMenu>
        <div className="group flex w-full items-center gap-1 whitespace-nowrap rounded-lg py-1.5 pl-2 pr-1 hover:bg-home-hover">
          <div className="flex flex-1 cursor-pointer items-center gap-2 overflow-hidden">
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
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
              onClick={() => router.push(`/${project.projectName}`)}
              className="flex-1 cursor-pointer truncate text-left"
            >
              <span className="text-foreground truncate text-[14px]">{project.projectName}</span>
            </button>
          </div>
          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
            <DropdownMenuTrigger asChild>
              <button className="text-muted-foreground hover:text-foreground flex h-6 w-6 cursor-pointer items-center justify-center rounded-md">
                <Ellipsis size={16} strokeWidth={2} />
              </button>
            </DropdownMenuTrigger>
            <button className="text-muted-foreground hover:text-foreground flex h-6 w-6 cursor-pointer items-center justify-center rounded-md">
              <GitBranch size={14} strokeWidth={1.8} />
            </button>
          </div>
        </div>
        <DropdownMenuContent side="right" align="start" className="w-[200px]">
          <DropdownMenuItem>
            <Share size={16} />
            Share
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Pen size={16} />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Pin size={16} />
            Pin project
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Archive size={16} />
            Archive
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive">
            <Trash2 size={16} />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {!isCollapsed && hasBranches && (
        <div className="flex flex-col gap-0.5 mt-0.5">
          {/* Active branches */}
          {activeBranches.map((branch) => (
            <BranchGroup
              key={branch.branchId}
              branch={branch}
              projectName={project.projectName}
              activeThreadId={routeCtx.threadId}
              defaultExpanded={isRouteProject && branchToSlug(branch.branchName) === activeBranch}
            />
          ))}

          {/* Merged branches section */}
          {mergedBranches.length > 0 && (
            <div>
              <button
                onClick={() => setIsMergedExpanded(!isMergedExpanded)}
                className="flex h-7 w-full cursor-pointer items-center gap-1 rounded-lg pl-6 pr-2 hover:bg-home-hover"
              >
                <ChevronRight
                  size={12}
                  strokeWidth={2}
                  className={cn(
                    'text-muted-foreground shrink-0 transition-transform duration-200',
                    isMergedExpanded && 'rotate-90'
                  )}
                />
                <span className="text-muted-foreground text-[12px]">
                  Merged ({mergedBranches.length})
                </span>
              </button>
              {isMergedExpanded &&
                mergedBranches.map((branch) => (
                  <BranchGroup
                    key={branch.branchId}
                    branch={branch}
                    projectName={project.projectName}
                    activeThreadId={routeCtx.threadId}
                    defaultExpanded={
                      isRouteProject && branchToSlug(branch.branchName) === activeBranch
                    }
                  />
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// ProjectList
// ---------------------------------------------------------------------------

const ProjectList: FC<{
  collapsed?: boolean;
}> = ({ collapsed }) => {
  const projects = useProjectsStore((s) => s.projects);
  const fetchProjects = useProjectsStore((s) => s.fetchProjects);
  const routeCtx = useRouteContext();
  const [collapseAllKey, setCollapseAllKey] = useState(0);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  const handleCollapseAll = () => setCollapseAllKey((k) => k + 1);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={cn('flex items-center px-3 pt-4 pb-1 mb-1', collapsed && 'hidden')}>
        <span className="text-muted-foreground flex-1 text-[14px]">Projects</span>
        <button
          onClick={handleCollapseAll}
          className="text-muted-foreground hover:text-foreground flex h-6 w-6 cursor-pointer items-center justify-center rounded-md hover:bg-home-hover"
        >
          <ChevronsDownUp size={15} strokeWidth={1.8} />
        </button>
      </div>
      <div className={cn('no-scrollbar flex-1 overflow-y-auto px-2', collapsed && 'hidden')}>
        {projects.length === 0 ? (
          <p className="text-muted-foreground flex justify-center whitespace-nowrap py-2 mt-12 text-xs">
            No projects yet.
          </p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {projects.map((project) => (
              <ProjectGroup
                key={project.projectId}
                project={project}
                routeCtx={routeCtx}
                collapseAllKey={collapseAllKey}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

function SidebarComponent() {
  const isSidebarCollapsed = useUiStore((s) => s.isSidebarCollapsed);
  const toggleSidebarCollapsed = useUiStore((s) => s.toggleSidebarCollapsed);
  const [isHovered, setIsHovered] = useState(false);

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
      {/* Header — logo / toggle */}
      <div className="flex items-center pt-3 pb-2 pl-[9px] pr-2">
        <div className="relative flex h-8 w-8 shrink-0 items-center justify-center">
          <span
            className={cn(
              'text-foreground absolute text-base font-semibold transition-opacity duration-200',
              showToggleIcon ? 'opacity-0' : 'opacity-100'
            )}
          >
            A
          </span>
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
          icon={<FolderPlus size={18} strokeWidth={1.8} />}
          label="New project"
          collapsed={isSidebarCollapsed}
        />
      </div>

      {/* Threads grouped by project */}
      <ProjectList collapsed={isSidebarCollapsed} />

      {/* Settings — pinned to bottom */}
      {!isSidebarCollapsed && <div className="border-home-border mx-2 border-t" />}
      <div className="px-2 pt-2 pb-3">
        <SidebarItem
          icon={<Settings size={18} strokeWidth={1.8} />}
          label="Settings"
          collapsed={isSidebarCollapsed}
        />
      </div>
    </div>
  );
}

export const Sidebar = memo(SidebarComponent);
