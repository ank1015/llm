'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useStickToBottom } from 'use-stick-to-bottom';

import { ChatMessages } from '@/components/chat-messages';
import { useChatStore } from '@/stores/chat-store';

export default function ConversationPage() {
  const { projectId, artifactId, threadId } = useParams<{
    projectId: string;
    artifactId: string;
    threadId: string;
  }>();
  const activeSession = useChatStore((state) => state.activeSession);
  const setActiveSession = useChatStore((state) => state.setActiveSession);
  const loadMessages = useChatStore((state) => state.loadMessages);

  const [shouldScroll] = useState(true);
  const { scrollRef, contentRef } = useStickToBottom({
    stiffness: 1,
    damping: 0,
  });

  useEffect(() => {
    if (!threadId) return;

    const ref = { sessionId: threadId };

    if (activeSession?.sessionId !== threadId) {
      setActiveSession(ref);
    }

    void loadMessages({ session: ref, projectId, artifactId });
  }, [activeSession?.sessionId, artifactId, loadMessages, projectId, setActiveSession, threadId]);

  return (
    <div
      className="no-scrollbar flex h-full min-h-0 w-full min-w-0 flex-1 flex-col items-center overflow-y-auto overflow-x-hidden px-8"
      ref={shouldScroll ? scrollRef : undefined}
    >
      <div className="mx-auto w-full max-w-(--breakpoint-md) pb-[200px] px-2 pt-2" ref={contentRef}>
        <ChatMessages />
      </div>
    </div>
  );
}
