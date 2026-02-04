/* eslint-disable sonarjs/no-duplicate-string */
'use client';
import {
  Archive,
  ChevronDown,
  Ellipsis,
  FolderOpen,
  Images,
  LifeBuoy,
  LogOut,
  PanelLeft,
  Pen,
  Pin,
  Search,
  Settings,
  Share,
  Smile,
  SparklesIcon,
  SquarePen,
  Trash2,
  UserRoundPlus,
} from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { memo, useEffect, useState } from 'react';

import type { SessionSummary } from '@ank1015/llm-sdk';
import type { FC, ReactNode } from 'react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
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
import { cn } from '@/lib/utils';
import { useChatStore, useSessionsStore, useUiStore } from '@/stores';

type SidebarItemProps = {
  icon: ReactNode;
  label: string;
  shortcut?: string;
  collapsed?: boolean;
  onClick?: () => void;
};

const SidebarItem: FC<SidebarItemProps> = ({ icon, label, shortcut, collapsed, onClick }) => {
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
      {!collapsed && shortcut && (
        <span className="text-muted-foreground text-xs opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          {shortcut}
        </span>
      )}
    </button>
  );
};

type ChatItemProps = {
  session: SessionSummary;
  isActive: boolean;
  onSelect: (session: SessionSummary) => void;
  onRename: (session: SessionSummary) => void;
  onDelete: (session: SessionSummary) => void;
};

const ChatItem: FC<ChatItemProps> = ({ session, isActive, onSelect, onRename, onDelete }) => {
  return (
    <DropdownMenu>
      <div
        onClick={() => onSelect(session)}
        className={cn(
          'group flex h-9 w-full cursor-pointer items-center rounded-lg pr-1 pl-3 text-[13px]',
          isActive ? 'bg-home-hover' : 'hover:bg-home-hover'
        )}
      >
        <span className="flex-1 truncate text-foreground">{session.sessionName}</span>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              'text-muted-foreground hover:text-foreground flex h-6 w-6 shrink-0 items-center justify-center rounded-md opacity-0 transition-opacity group-hover:opacity-100',
              isActive && 'opacity-100'
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <Ellipsis size={16} strokeWidth={2} />
          </button>
        </DropdownMenuTrigger>
      </div>
      <DropdownMenuContent side="right" align="start" className="w-[200px]">
        <DropdownMenuItem>
          <Share size={16} />
          Share
        </DropdownMenuItem>
        <DropdownMenuItem>
          <UserRoundPlus size={16} />
          Start a group chat
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            onRename(session);
          }}
        >
          <Pen size={16} />
          Rename
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <FolderOpen size={16} />
            Move to project
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem>Project A</DropdownMenuItem>
            <DropdownMenuItem>Project B</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem>
          <Pin size={16} />
          Pin chat
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Archive size={16} />
          Archive
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(session);
          }}
        >
          <Trash2 size={16} />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const ChatList: FC<{ collapsed?: boolean }> = ({ collapsed }) => {
  const [isSectionCollapsed, setIsSectionCollapsed] = useState(false);

  const sessions = useSessionsStore((state) => state.sessions);
  const isLoading = useSessionsStore((state) => state.isLoading);
  const hasMore = useSessionsStore((state) => state.hasMore);
  const isLoadingMore = useSessionsStore((state) => state.isLoadingMore);
  const fetchFirstPage = useSessionsStore((state) => state.fetchFirstPage);
  const fetchNextPage = useSessionsStore((state) => state.fetchNextPage);
  const scope = useSessionsStore((state) => state.scope);
  const renameSession = useSessionsStore((state) => state.renameSession);
  const deleteSession = useSessionsStore((state) => state.deleteSession);

  const activeSession = useChatStore((state) => state.activeSession);
  const setActiveSession = useChatStore((state) => state.setActiveSession);
  const clearSessionState = useChatStore((state) => state.clearSessionState);

  const router = useRouter();

  useEffect(() => {
    void fetchFirstPage();
  }, [fetchFirstPage]);

  const handleSelect = (session: SessionSummary) => {
    const ref = {
      sessionId: session.sessionId,
      projectName: scope.projectName,
      path: scope.path,
    };
    setActiveSession(ref);
    router.push(`/${session.sessionId}`);
  };

  const handleRename = (session: SessionSummary) => {
    const newName = prompt('Rename chat', session.sessionName);
    if (newName && newName.trim()) {
      void renameSession({ sessionId: session.sessionId, sessionName: newName.trim() });
    }
  };

  const handleDelete = async (session: SessionSummary) => {
    await deleteSession({ sessionId: session.sessionId });
    if (activeSession?.sessionId === session.sessionId) {
      clearSessionState(activeSession);
      setActiveSession(null);
      router.push('/');
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!collapsed && (
        <button
          onClick={() => setIsSectionCollapsed(!isSectionCollapsed)}
          className="flex cursor-pointer items-center gap-1 whitespace-nowrap px-3 pt-4 pb-1"
        >
          <span className="text-muted-foreground text-xs">Your chats</span>
          <ChevronDown
            size={12}
            strokeWidth={2}
            className={cn(
              'text-muted-foreground transition-transform duration-200',
              isSectionCollapsed && '-rotate-90'
            )}
          />
        </button>
      )}
      {!isSectionCollapsed && !collapsed && (
        <div className="no-scrollbar flex-1 overflow-y-auto px-2">
          {isLoading && sessions.length === 0 ? (
            <div className="space-y-1 px-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={`skel-${i}`} className="bg-home-hover/50 h-9 animate-pulse rounded-lg" />
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-muted-foreground flex justify-center whitespace-nowrap py-2 mt-12 text-xs">
              No chats yet.
            </p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {sessions.map((session) => (
                <ChatItem
                  key={session.sessionId}
                  session={session}
                  isActive={activeSession?.sessionId === session.sessionId}
                  onSelect={handleSelect}
                  onRename={handleRename}
                  onDelete={(s) => void handleDelete(s)}
                />
              ))}
              {hasMore && (
                <button
                  type="button"
                  onClick={() => void fetchNextPage()}
                  disabled={isLoadingMore}
                  className="text-muted-foreground hover:bg-home-hover mt-1 w-full rounded-lg px-3 py-1.5 text-xs disabled:opacity-50"
                >
                  {isLoadingMore ? 'Loading...' : 'Load more'}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

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
        {/* User info */}
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

        {/* Main actions */}
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

        {/* Help submenu */}
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

function SidebarComponent() {
  const isSidebarCollapsed = useUiStore((state) => state.isSidebarCollapsed);
  const toggleSidebarCollapsed = useUiStore((state) => state.toggleSidebarCollapsed);
  const theme = useUiStore((state) => state.theme);
  const [isHovered, setIsHovered] = useState(false);
  const router = useRouter();

  const logoSrc = theme === 'dark' ? '/logo-light.png' : '/logo-dark.png';
  const showToggleIcon = isSidebarCollapsed && isHovered;

  return (
    <div
      className={cn(
        'border-home-border flex h-full shrink-0 flex-col overflow-hidden border-r transition-all duration-300 ease-in-out',
        isSidebarCollapsed ? 'w-[50px] bg-home-page cursor-pointer' : 'w-[260px] bg-home-panel'
      )}
      onMouseEnter={() => isSidebarCollapsed && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => isSidebarCollapsed && toggleSidebarCollapsed()}
    >
      {/* Header — logo pinned at fixed left offset so it doesn't move on collapse */}
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

      {/* Navigation items — always rendered, icon position fixed via px-2 + pl-[8px] = 16px */}
      <div className="mt-2 flex flex-col gap-0.5 px-2">
        <SidebarItem
          icon={<SquarePen size={18} strokeWidth={1.8} />}
          label="New chat"
          shortcut="⇧⌘O"
          onClick={() => {
            router.push('/');
          }}
          collapsed={isSidebarCollapsed}
        />
        <SidebarItem
          icon={<Search size={18} strokeWidth={1.8} />}
          label="Search chats"
          shortcut="⇧⌘K"
          collapsed={isSidebarCollapsed}
        />
        <SidebarItem
          icon={<Images size={18} strokeWidth={1.8} />}
          label="Images"
          collapsed={isSidebarCollapsed}
        />
      </div>

      {/* Chat list — always mounted, content hidden when collapsed */}
      <ChatList collapsed={isSidebarCollapsed} />

      {/* Account menu — pinned to bottom */}
      {!isSidebarCollapsed && <div className="border-home-border mx-2 border-t" />}
      <div className="px-2 pt-2 pb-3">
        <AccountMenu collapsed={isSidebarCollapsed} />
      </div>
    </div>
  );
}

export const Sidebar = memo(SidebarComponent);
