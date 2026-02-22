 
'use client';
import {
  Archive,
  ChevronDown,
  Ellipsis,
  FilterIcon,
  Folder,
  FolderPlus,
  PanelLeft,
  Pen,
  Pin,
  Settings,
  Share,
  SquarePen,
  Trash2,
} from 'lucide-react';
import { memo, useState } from 'react';

import type { FC, ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

type MockSession = {
  sessionId: string;
  sessionName: string;
  age: string;
};

type MockProject = {
  projectId: string;
  projectName: string;
  chats: MockSession[];
};

const MOCK_PROJECTS: MockProject[] = [
  {
    projectId: 'p1',
    projectName: 'polymarket',
    chats: [
      { sessionId: '1', sessionName: 'Review high-level strategy for Q2', age: '3d' },
      { sessionId: '2', sessionName: 'Review polymarket strategy docs', age: '3d' },
      { sessionId: '3', sessionName: 'Estimate storage and compute costs', age: '3d' },
    ],
  },
  {
    projectId: 'p2',
    projectName: 'web-reader',
    chats: [],
  },
  {
    projectId: 'p3',
    projectName: 'llm',
    chats: [],
  },
];

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
// ChatItem
// ---------------------------------------------------------------------------

type ChatItemProps = {
  session: MockSession;
  isActive: boolean;
  onSelect: (session: MockSession) => void;
};

const ChatItem: FC<ChatItemProps> = ({ session, isActive, onSelect }) => {
  return (
    <div
      onClick={() => onSelect(session)}
      className={cn(
        'flex h-9 w-full cursor-pointer items-center rounded-lg pr-2 pl-7 text-[13px]',
        isActive ? 'bg-home-hover' : 'hover:bg-home-hover'
      )}
    >
      <span className="flex-1 truncate text-foreground text-[13px]">{session.sessionName}</span>
      <span className="text-muted-foreground ml-2 shrink-0 text-[12px]">{session.age}</span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// ProjectGroup — a single collapsible project with its chats
// ---------------------------------------------------------------------------

const ProjectGroup: FC<{
  project: MockProject;
  activeSessionId: string | null;
  onSelect: (session: MockSession) => void;
}> = ({ project, activeSessionId, onSelect }) => {
  const hasChats = project.chats.length > 0;
  const [isCollapsed, setIsCollapsed] = useState(!hasChats);

  return (
    <div>
      <DropdownMenu>
        <div className="group flex w-full items-center gap-1 whitespace-nowrap rounded-lg py-1.5 pl-2 pr-1 hover:bg-home-hover">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="flex flex-1 cursor-pointer items-center gap-2 overflow-hidden"
          >
            <div className="relative flex h-4 w-4 shrink-0 items-center justify-center">
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
            </div>
            <span className="text-foreground truncate text-[14px]">{project.projectName}</span>
          </button>
          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
            <DropdownMenuTrigger asChild>
              <button className="text-muted-foreground hover:text-foreground flex h-6 w-6 cursor-pointer items-center justify-center rounded-md">
                <Ellipsis size={16} strokeWidth={2} />
              </button>
            </DropdownMenuTrigger>
            <button className="text-muted-foreground hover:text-foreground flex h-6 w-6 cursor-pointer items-center justify-center rounded-md">
              <SquarePen size={14} strokeWidth={1.8} />
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
      {hasChats && !isCollapsed && (
        <div className="flex flex-col gap-0.5 mt-0.5">
          {project.chats.map((session) => (
            <ChatItem
              key={session.sessionId}
              session={session}
              isActive={activeSessionId === session.sessionId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// ProjectList
// ---------------------------------------------------------------------------

const ProjectList: FC<{ collapsed?: boolean }> = ({ collapsed }) => {
  const [projects] = useState(MOCK_PROJECTS);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const handleSelect = (session: MockSession) => {
    setActiveSessionId(session.sessionId);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!collapsed && (
        <div className="flex items-center px-3 pt-4 pb-1 mb-1">
          <span className="text-muted-foreground flex-1 text-[14px]">Threads</span>
          <div className="flex items-center gap-0.5">
            <button className="text-muted-foreground hover:text-foreground flex h-6 w-6 cursor-pointer items-center justify-center rounded-md hover:bg-home-hover">
              <FolderPlus size={15} strokeWidth={1.8} />
            </button>
            <button className="text-muted-foreground hover:text-foreground flex h-6 w-6 cursor-pointer items-center justify-center rounded-md hover:bg-home-hover">
              <FilterIcon size={15} strokeWidth={1.8} />
            </button>
          </div>
        </div>
      )}
      {!collapsed && (
        <div className="no-scrollbar flex-1 overflow-y-auto px-2">
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
                  activeSessionId={activeSessionId}
                  onSelect={handleSelect}
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
// Sidebar
// ---------------------------------------------------------------------------

function SidebarComponent() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const toggleSidebarCollapsed = () => setIsSidebarCollapsed((prev) => !prev);

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
          icon={<SquarePen size={18} strokeWidth={1.8} />}
          label="New thread"
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
