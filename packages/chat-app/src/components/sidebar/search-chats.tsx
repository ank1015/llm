'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { SessionSummary } from '@ank1015/llm-sdk';

import {
  Command,
  CommandEmpty,
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

export function SearchChatsDialog({ open, onOpenChange }: SearchChatsDialogProps) {
  const [results, setResults] = useState<SessionSummary[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const requestIdRef = useRef(0);

  const scope = useSessionsStore((state) => state.scope);
  const setActiveSession = useChatStore((state) => state.setActiveSession);
  const loadMessages = useChatStore((state) => state.loadMessages);

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
    void loadMessages({ session: sessionRef });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0">
        <DialogTitle className="sr-only">Search Chats</DialogTitle>
        <Command shouldFilter={false} className="**:data-[slot=command-input-wrapper]:h-auto">
          <CommandInput
            placeholder="Search chats..."
            className="h-auto py-3.5"
            onValueChange={handleInputChange}
          />
          <CommandList>
            <CommandEmpty>{isSearching ? 'Searching...' : 'No chats found.'}</CommandEmpty>
            {results.map((session) => (
              <CommandItem
                key={session.sessionId}
                value={session.sessionId}
                onSelect={() => handleSelect(session)}
                className="flex flex-col items-start gap-0.5 px-4 py-2.5"
              >
                <span className="text-sm">{session.sessionName}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(session.updatedAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
