'use client';

import { Ellipsis, Pencil, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import type { SessionSummary } from '@ank1015/llm-sdk';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/stores/chat-store';
import { useSessionsStore } from '@/stores/sessions-store';

type ChatItemProps = {
  session: SessionSummary;
  isActive: boolean;
  onSelect: (session: SessionSummary) => void;
  onRename: (session: SessionSummary) => void;
  onDelete: (session: SessionSummary) => void;
};

function ChatItem({ session, isActive, onSelect, onRename, onDelete }: ChatItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <button
      type="button"
      onClick={() => onSelect(session)}
      className={cn(
        'group flex w-full items-center gap-1 rounded-md border px-2 py-1.5 text-left text-sm transition-all',
        isActive
          ? 'border-input bg-accent text-accent-foreground shadow-xs'
          : 'border-transparent text-muted-foreground hover:border-input hover:bg-accent hover:text-accent-foreground hover:shadow-xs dark:hover:bg-input/50'
      )}
    >
      <span className="flex-1 truncate">{session.sessionName}</span>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger
          className="border-0"
          asChild
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          <span
            tabIndex={0}
            className={cn(
              'shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100',
              menuOpen && 'opacity-100'
            )}
          >
            <Ellipsis size={14} />
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start">
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onRename(session);
            }}
          >
            <Pencil size={14} />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(session);
            }}
          >
            <Trash2 size={14} />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </button>
  );
}

type RenameDialogProps = {
  session: SessionSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function RenameDialog({ session, open, onOpenChange }: RenameDialogProps) {
  const [draft, setDraft] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const renameSession = useSessionsStore((state) => state.renameSession);

  useEffect(() => {
    if (open && session) {
      setDraft(session.sessionName);
      setIsSubmitting(false);
    }
  }, [open, session]);

  useEffect(() => {
    if (open) {
      // Wait for dialog animation to finish before focusing
      const timeout = setTimeout(() => inputRef.current?.select(), 50);
      return () => clearTimeout(timeout);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!session || draft.trim().length === 0) return;
    setIsSubmitting(true);
    try {
      await renameSession({ sessionId: session.sessionId, sessionName: draft.trim() });
      onOpenChange(false);
    } catch {
      // store sets mutationError
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename chat</DialogTitle>
          <DialogDescription>Enter a new name for this chat.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
          className="space-y-4"
        >
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Chat name"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!draft.trim() || isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type DeleteDialogProps = {
  session: SessionSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function DeleteDialog({ session, open, onOpenChange }: DeleteDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();
  const deleteSession = useSessionsStore((state) => state.deleteSession);
  const activeSession = useChatStore((state) => state.activeSession);
  const setActiveSession = useChatStore((state) => state.setActiveSession);
  const clearSessionState = useChatStore((state) => state.clearSessionState);

  const handleConfirm = async () => {
    if (!session) return;
    setIsDeleting(true);
    try {
      await deleteSession({ sessionId: session.sessionId });
      if (activeSession?.sessionId === session.sessionId) {
        clearSessionState(activeSession);
        setActiveSession(null);
        router.push('/chat');
      }
      onOpenChange(false);
    } catch {
      // store sets mutationError
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete chat</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete &ldquo;{session?.sessionName}&rdquo;? This action cannot
            be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={isDeleting}
            onClick={() => void handleConfirm()}
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ChatList() {
  const sessions = useSessionsStore((state) => state.sessions);
  const isLoading = useSessionsStore((state) => state.isLoading);
  const hasMore = useSessionsStore((state) => state.hasMore);
  const isLoadingMore = useSessionsStore((state) => state.isLoadingMore);
  const fetchFirstPage = useSessionsStore((state) => state.fetchFirstPage);
  const fetchNextPage = useSessionsStore((state) => state.fetchNextPage);
  const scope = useSessionsStore((state) => state.scope);

  const activeSession = useChatStore((state) => state.activeSession);
  const setActiveSession = useChatStore((state) => state.setActiveSession);

  const router = useRouter();
  const [renameTarget, setRenameTarget] = useState<SessionSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SessionSummary | null>(null);

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
    router.push(`/chat/${session.sessionId}`);
  };

  if (isLoading && sessions.length === 0) {
    return (
      <div className="space-y-2 px-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={`skel-${i}`} className="h-7 animate-pulse rounded-md bg-muted/40" />
        ))}
      </div>
    );
  }

  if (sessions.length === 0) {
    return <p className="px-3 text-xs text-muted-foreground">No chats yet. Start a new one.</p>;
  }

  return (
    <>
      <div className="flex flex-col gap-0.5 px-2">
        {sessions.map((session) => (
          <ChatItem
            key={session.sessionId}
            session={session}
            isActive={activeSession?.sessionId === session.sessionId}
            onSelect={handleSelect}
            onRename={setRenameTarget}
            onDelete={setDeleteTarget}
          />
        ))}
        {hasMore && (
          <button
            type="button"
            onClick={() => void fetchNextPage()}
            disabled={isLoadingMore}
            className="mt-1 w-full rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent/50 disabled:opacity-50"
          >
            {isLoadingMore ? 'Loading...' : 'Load more'}
          </button>
        )}
      </div>

      <RenameDialog
        session={renameTarget}
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
      />
      <DeleteDialog
        session={deleteTarget}
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      />
    </>
  );
}
