'use client';

import {
  ChevronDown,
  ChevronsDownUp,
  Folder,
  FolderPlus,
  PanelLeft,
  Settings,
  SquarePen,
} from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { memo, useMemo, useState } from 'react';

import type { Artifact, Thread } from '@/lib/mock-data';

import { Button } from '@/components/ui/button';
import { mockArtifacts } from '@/lib/mock-data';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores/ui-store';

// ---------------------------------------------------------------------------
// SidebarItem
// ---------------------------------------------------------------------------

function SidebarItem({
  icon,
  label,
  collapsed,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  collapsed?: boolean;
  onClick?: () => void;
}) {
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
}

// ---------------------------------------------------------------------------
// ThreadItem
// ---------------------------------------------------------------------------

function ThreadItem({ thread }: { thread: Thread }) {
  return (
    <div className="flex h-8 w-full cursor-pointer items-center rounded-lg pr-2 pl-8 hover:bg-home-hover">
      <span className="flex-1 truncate text-[13px] text-foreground">{thread.name}</span>
      <span className="ml-2 shrink-0 text-[12px] text-muted-foreground">{thread.age}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ArtifactGroup
// ---------------------------------------------------------------------------

function ArtifactGroup({
  artifact,
  projectName,
  collapseAllKey,
}: {
  artifact: Artifact;
  projectName: string;
  collapseAllKey: number;
}) {
  const router = useRouter();
  const hasThreads = artifact.threads.length > 0;
  const [isCollapsed, setIsCollapsed] = useState(false);

  const [prevCollapseAllKey, setPrevCollapseAllKey] = useState(collapseAllKey);
  if (prevCollapseAllKey !== collapseAllKey) {
    setPrevCollapseAllKey(collapseAllKey);
    if (collapseAllKey > 0) setIsCollapsed(true);
  }

  return (
    <div>
      <div className="group flex w-full items-center gap-1 whitespace-nowrap rounded-lg py-1.5 pl-2 pr-1 hover:bg-home-hover">
        <div className="flex flex-1 items-center gap-2 overflow-hidden">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="relative flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center"
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
            onClick={() => router.push(`/${projectName}/${artifact.name}`)}
            className="flex-1 cursor-pointer truncate text-left"
          >
            <span className="truncate text-[14px] text-foreground">{artifact.name}</span>
          </button>
        </div>
        <div className="flex shrink-0 items-center opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          <button className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:text-foreground">
            <SquarePen size={13} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {!isCollapsed && hasThreads && (
        <div className="mt-0.5 flex flex-col gap-0.5">
          {artifact.threads.map((thread) => (
            <ThreadItem key={thread.id} thread={thread} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ArtifactList
// ---------------------------------------------------------------------------

function ArtifactList({ collapsed }: { collapsed?: boolean }) {
  const pathname = usePathname();
  const projectName = useMemo(() => pathname.split('/').filter(Boolean)[0] ?? '', [pathname]);
  const [collapseAllKey, setCollapseAllKey] = useState(0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={cn('mb-1 flex items-center px-3 pt-4 pb-1', collapsed && 'hidden')}>
        <span className="flex-1 text-[14px] text-muted-foreground">Artifacts</span>
        <button
          onClick={() => setCollapseAllKey((k) => k + 1)}
          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-home-hover hover:text-foreground"
        >
          <ChevronsDownUp size={15} strokeWidth={1.8} />
        </button>
      </div>
      <div className={cn('no-scrollbar flex-1 overflow-y-auto px-2', collapsed && 'hidden')}>
        {mockArtifacts.length === 0 ? (
          <p className="mt-12 flex justify-center whitespace-nowrap py-2 text-xs text-muted-foreground">
            No artifacts yet.
          </p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {mockArtifacts.map((artifact) => (
              <ArtifactGroup
                key={artifact.id}
                artifact={artifact}
                projectName={projectName}
                collapseAllKey={collapseAllKey}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

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
        isSidebarCollapsed ? 'w-[50px] cursor-w-resize bg-home-page' : 'w-[260px] bg-home-panel'
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

      {/* New Artifact button */}
      <div className="mt-2 flex flex-col gap-0.5 px-2">
        <SidebarItem
          icon={<FolderPlus size={18} strokeWidth={1.8} />}
          label="New Artifact"
          collapsed={isSidebarCollapsed}
        />
      </div>

      {/* Artifacts list */}
      <ArtifactList collapsed={isSidebarCollapsed} />

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
