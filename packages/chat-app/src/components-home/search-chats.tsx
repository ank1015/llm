'use client';

import { MessageCircle, SquarePen, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { SessionSummary } from '@ank1015/llm-sdk';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { listSessions } from '@/lib/client-api';
import { useChatStore } from '@/stores/chat-store';
import { useSessionsStore } from '@/stores/sessions-store';

type SearchChatsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type GroupedSessions = {
  label: string;
  sessions: SessionSummary[];
};

function groupSessionsByDate(sessions: SessionSummary[]): GroupedSessions[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86_400_000);
  const startOf7DaysAgo = new Date(startOfToday.getTime() - 7 * 86_400_000);
  const startOf30DaysAgo = new Date(startOfToday.getTime() - 30 * 86_400_000);

  const buckets: Record<string, SessionSummary[]> = {
    Today: [],
    Yesterday: [],
    'Previous 7 Days': [],
    'Previous 30 Days': [],
    Older: [],
  };

  for (const session of sessions) {
    const date = new Date(session.updatedAt);
    if (date >= startOfToday) {
      buckets['Today'].push(session);
    } else if (date >= startOfYesterday) {
      buckets['Yesterday'].push(session);
    } else if (date >= startOf7DaysAgo) {
      buckets['Previous 7 Days'].push(session);
    } else if (date >= startOf30DaysAgo) {
      buckets['Previous 30 Days'].push(session);
    } else {
      buckets['Older'].push(session);
    }
  }

  const order = ['Today', 'Yesterday', 'Previous 7 Days', 'Previous 30 Days', 'Older'];
  return order
    .filter((label) => buckets[label].length > 0)
    .map((label) => ({ label, sessions: buckets[label] }));
}

export function SearchChatsDialog({ open, onOpenChange }: SearchChatsDialogProps) {
  const [results, setResults] = useState<SessionSummary[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const requestIdRef = useRef(0);

  const scope = useSessionsStore((state) => state.scope);
  const setActiveSession = useChatStore((state) => state.setActiveSession);
  const router = useRouter();

  const fetchResults = useCallback(
    async (query: string) => {
      const requestId = ++requestIdRef.current;
      setIsSearching(true);

      try {
        const response = await listSessions({
          ...scope,
          query,
          limit: 20,
          offset: 0,
        });

        if (requestId !== requestIdRef.current) return;
        setResults(response.sessions);
      } catch {
        if (requestId !== requestIdRef.current) return;
        setResults([]);
      } finally {
        if (requestId === requestIdRef.current) {
          setIsSearching(false);
        }
      }
    },
    [scope]
  );

  useEffect(() => {
    if (open) {
      void fetchResults('');
    } else {
      setResults([]);
    }
  }, [open, fetchResults]);

  const handleInputChange = (value: string) => {
    void fetchResults(value);
  };

  const handleSelect = (session: SessionSummary) => {
    const sessionRef = {
      sessionId: session.sessionId,
      projectName: scope.projectName,
      path: scope.path,
    };

    setActiveSession(sessionRef);
    router.push(`/${session.sessionId}`);
    onOpenChange(false);
  };

  const handleNewChat = () => {
    setActiveSession(null);
    router.push('/');
    onOpenChange(false);
  };

  const grouped = useMemo(() => groupSessionsByDate(results), [results]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-home-page border-home-border h-[400px] gap-0 overflow-hidden p-0 sm:max-w-xl"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Search Chats</DialogTitle>
        <Command
          shouldFilter={false}
          className="bg-home-page **:data-[slot=command-input-wrapper]:border-home-border [&_[data-slot=command-input-wrapper]_svg]:hidden"
        >
          {/* Search input with X close button */}
          <div className="relative py-2">
            <CommandInput
              placeholder="Search chats..."
              className=" py-[30px] px-1 pr-10 text-[16px]"
              onValueChange={handleInputChange}
            />
            <button
              onClick={() => onOpenChange(false)}
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2 cursor-pointer"
            >
              <X size={18} strokeWidth={2} />
            </button>
          </div>

          <CommandList className="max-h-none flex-1 p-1.5">
            <CommandEmpty className="text-muted-foreground py-6 text-center text-sm">
              {isSearching ? 'Searching...' : 'No chats found.'}
            </CommandEmpty>

            {/* New chat item */}
            <CommandItem
              onSelect={handleNewChat}
              className="hover:bg-home-hover data-[selected=true]:bg-home-hover mb-1 flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5"
            >
              <SquarePen size={18} strokeWidth={1.8} className="text-foreground shrink-0" />
              <span className="text-foreground text-sm">New chat</span>
            </CommandItem>

            {/* Grouped chat sessions */}
            {grouped.map((group) => (
              <CommandGroup
                key={group.label}
                heading={group.label}
                className="[&_[cmdk-group-heading]]:text-muted-foreground/70 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-normal"
              >
                {group.sessions.map((session) => (
                  <CommandItem
                    key={session.sessionId}
                    value={session.sessionId}
                    onSelect={() => handleSelect(session)}
                    className="hover:bg-home-hover data-[selected=true]:bg-home-hover flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5"
                  >
                    <MessageCircle
                      size={18}
                      strokeWidth={1.5}
                      className="text-foreground shrink-0"
                    />
                    <span className="text-foreground truncate text-sm">{session.sessionName}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
