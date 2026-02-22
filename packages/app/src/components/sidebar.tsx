/* eslint-disable sonarjs/no-duplicate-string */
'use client';
import {
  Archive,
  ChevronDown,
  Ellipsis,
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
} from 'lucide-react';
import { memo, useRef, useState } from 'react';

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
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

type MockSession = {
  sessionId: string;
  sessionName: string;
};

const MOCK_SESSIONS: MockSession[] = [
  { sessionId: '1', sessionName: 'Building a REST API with Hono' },
  { sessionId: '2', sessionName: 'React state management patterns' },
  { sessionId: '3', sessionName: 'TypeScript generics deep dive' },
  { sessionId: '4', sessionName: 'Deploying to Cloudflare Workers' },
  { sessionId: '5', sessionName: 'CSS Grid vs Flexbox layout' },
  { sessionId: '6', sessionName: 'Database schema design tips' },
  { sessionId: '7', sessionName: 'Authentication with JWT tokens' },
  { sessionId: '8', sessionName: 'WebSocket real-time features' },
];

// ---------------------------------------------------------------------------
// SidebarItem
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// ChatItem
// ---------------------------------------------------------------------------

type ChatItemProps = {
  session: MockSession;
  isActive: boolean;
  onSelect: (session: MockSession) => void;
  onRename: (session: MockSession) => void;
  onDelete: (session: MockSession) => void;
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
        <span className="flex-1 truncate text-foreground text-[14px]">{session.sessionName}</span>
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
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            onRename(session);
          }}
        >
          <Pen size={16} />
          Rename
        </DropdownMenuItem>
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

// ---------------------------------------------------------------------------
// ChatList
// ---------------------------------------------------------------------------

const ChatList: FC<{ collapsed?: boolean }> = ({ collapsed }) => {
  const [isSectionCollapsed, setIsSectionCollapsed] = useState(false);
  const [sessions, setSessions] = useState(MOCK_SESSIONS);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [renamingSession, setRenamingSession] = useState<MockSession | null>(null);
  const [deletingSession, setDeletingSession] = useState<MockSession | null>(null);

  const handleSelect = (session: MockSession) => {
    setActiveSessionId(session.sessionId);
  };

  const confirmRename = (newName: string) => {
    if (!renamingSession) return;
    setSessions((prev) =>
      prev.map((s) =>
        s.sessionId === renamingSession.sessionId ? { ...s, sessionName: newName } : s
      )
    );
    setRenamingSession(null);
  };

  const confirmDelete = () => {
    if (!deletingSession) return;
    setSessions((prev) => prev.filter((s) => s.sessionId !== deletingSession.sessionId));
    if (activeSessionId === deletingSession.sessionId) {
      setActiveSessionId(null);
    }
    setDeletingSession(null);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!collapsed && (
        <button
          onClick={() => setIsSectionCollapsed(!isSectionCollapsed)}
          className="flex cursor-pointer items-center gap-1 whitespace-nowrap px-3 pt-4 pb-1 mb-1"
        >
          <span className="text-muted-foreground text-[14px]">Your chats</span>
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
          {sessions.length === 0 ? (
            <p className="text-muted-foreground flex justify-center whitespace-nowrap py-2 mt-12 text-xs">
              No chats yet.
            </p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {sessions.map((session) => (
                <ChatItem
                  key={session.sessionId}
                  session={session}
                  isActive={activeSessionId === session.sessionId}
                  onSelect={handleSelect}
                  onRename={setRenamingSession}
                  onDelete={setDeletingSession}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Rename dialog */}
      <RenameDialog
        session={renamingSession}
        onOpenChange={(open) => !open && setRenamingSession(null)}
        onConfirm={confirmRename}
      />

      {/* Delete confirmation dialog */}
      <DeleteDialog
        session={deletingSession}
        onOpenChange={(open) => !open && setDeletingSession(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// RenameDialog
// ---------------------------------------------------------------------------

const RenameDialog: FC<{
  session: MockSession | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (newName: string) => void;
}> = ({ session, onOpenChange, onConfirm }) => {
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync name when session changes
  const prevSessionRef = useRef<string | null>(null);
  if (session && session.sessionId !== prevSessionRef.current) {
    prevSessionRef.current = session.sessionId;
    setName(session.sessionName);
    setTimeout(() => inputRef.current?.select(), 0);
  }
  if (!session) {
    prevSessionRef.current = null;
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed && trimmed !== session?.sessionName) {
      onConfirm(trimmed);
    } else {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={!!session} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-home-page border-home-border sm:max-w-sm"
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle className="text-foreground text-base">Rename chat</DialogTitle>
          <DialogDescription className="sr-only">Enter a new name for this chat.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-home-panel border-home-border text-foreground placeholder:text-muted-foreground w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-foreground/20"
            placeholder="Chat name"
          />
          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button type="submit" className="cursor-pointer" disabled={!name.trim()}>
              Rename
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------
// DeleteDialog
// ---------------------------------------------------------------------------

const DeleteDialog: FC<{
  session: MockSession | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}> = ({ session, onOpenChange, onConfirm }) => {
  return (
    <Dialog open={!!session} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-home-page border-home-border sm:max-w-sm"
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle className="text-foreground text-base">Delete chat?</DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            This will delete{' '}
            <span className="text-foreground font-medium">{session?.sessionName}</span>. This action
            cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="cursor-pointer"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            className="cursor-pointer"
          >
            Delete
          </Button>
        </DialogFooter>
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
          label="New chat"
          shortcut="⇧⌘O"
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

      {/* Chat list */}
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
