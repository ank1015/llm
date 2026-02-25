'use client';

import { ArrowUp, Square } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from './prompt-input';

import type { SessionRef } from '@/lib/contracts';

import { Button } from '@/components/ui/button';
import { generateSessionName } from '@/lib/client-api';
import { useChatStore, useSessionsStore, useSidebarStore } from '@/stores';

function isAbortError(error: unknown): boolean {
  if (!error) return false;
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return error.name === 'AbortError';
  }
  if (error instanceof Error) {
    return error.name === 'AbortError' || error.message.toLowerCase().includes('abort');
  }
  return false;
}

/* ------------------------------------------------------------------ */
/*  PromptInputWithActions                                            */
/* ------------------------------------------------------------------ */

function PromptInputWithActions() {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { projectId, artifactId, threadId } = useParams<{
    projectId: string;
    artifactId: string;
    threadId?: string;
  }>();

  const ctx = { projectId, artifactId };

  // Use threadId from URL as the source of truth — the store's activeSession
  // can be stale when navigating between artifacts.
  const currentSession: SessionRef | null = threadId ? { sessionId: threadId } : null;

  const startStream = useChatStore((state) => state.startStream);
  const abortStream = useChatStore((state) => state.abortStream);
  const loadMessages = useChatStore((state) => state.loadMessages);
  const setActiveSession = useChatStore((state) => state.setActiveSession);

  const isStreaming = useChatStore((state) => {
    if (!currentSession) return false;
    return state.isStreamingBySession[currentSession.sessionId] ?? false;
  });

  const createSession = useSessionsStore((state) => state.createSession);

  const sidebarAddSession = useSidebarStore((state) => state.addSession);
  const sidebarRenameSession = useSidebarStore((state) => state.renameSession);

  const handleSubmit = async () => {
    const trimmed = input.trim();
    if (trimmed === '' || isStreaming) return;

    setError(null);

    try {
      let session: SessionRef | undefined = currentSession ?? undefined;

      if (!session) {
        const created = await createSession(ctx, { sessionName: 'New chat' });
        const ref: SessionRef = { sessionId: created.sessionId };
        setActiveSession(ref);

        // Optimistically add the new thread to the sidebar immediately
        sidebarAddSession(artifactId, {
          sessionId: created.sessionId,
          sessionName: 'New chat',
          createdAt: new Date().toISOString(),
          updatedAt: null,
          nodeCount: 0,
        });

        router.push(`/${projectId}/${artifactId}/${created.sessionId}`);
        await loadMessages({ session: ref, projectId, artifactId, force: true });
        session = ref;

        void generateSessionName(ctx, {
          sessionId: created.sessionId,
          query: trimmed,
        })
          .then((result) => {
            sidebarRenameSession(created.sessionId, result.sessionName);
          })
          .catch(() => {
            // Naming failed silently — keep "New chat"
          });
      }

      if (!session) {
        throw new Error('Could not create or select a session.');
      }

      setInput('');

      await startStream({
        sessionId: session.sessionId,
        prompt: trimmed,
        projectId,
        artifactId,
      });
    } catch (err) {
      if (isAbortError(err)) return;
      const message = err instanceof Error ? err.message : 'Failed to send message.';
      setError(message);
    }
  };

  const handleStop = () => {
    if (currentSession) {
      abortStream(currentSession);
    }
  };

  return (
    <PromptInput
      value={input}
      onValueChange={setInput}
      isLoading={isStreaming}
      onSubmit={handleSubmit}
      className="w-full max-w-(--breakpoint-md)"
    >
      <PromptInputTextarea placeholder="Ask me anything..." />

      <PromptInputActions className="flex items-center justify-between gap-2 pt-4">
        <div className="flex items-center gap-2" />

        <PromptInputAction tooltip={isStreaming ? 'Stop generation' : 'Send message'}>
          <Button
            variant="default"
            size="icon"
            className="h-8 w-8 cursor-pointer rounded-full"
            onClick={isStreaming ? handleStop : handleSubmit}
          >
            {isStreaming ? (
              <Square className="size-3 fill-current" />
            ) : (
              <ArrowUp className="size-4" />
            )}
          </Button>
        </PromptInputAction>
      </PromptInputActions>

      {error ? <p className="mt-2 text-xs text-red-500">{error}</p> : null}
    </PromptInput>
  );
}

/* ------------------------------------------------------------------ */
/*  ChatInput                                                         */
/* ------------------------------------------------------------------ */

export const ChatInput = () => {
  return (
    <div className="bg-home-page absolute bottom-0 w-full px-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-start pb-4">
        <PromptInputWithActions />
      </div>
    </div>
  );
};
