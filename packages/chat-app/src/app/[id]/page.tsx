'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useStickToBottom } from 'use-stick-to-bottom';

import { ChatMessages } from '@/components/chat-messages';
import { useChatStore } from '@/stores/chat-store';
import { useSessionsStore } from '@/stores/sessions-store';

export default function ConversationPage() {
  const { id } = useParams<{ id: string }>();
  const activeSession = useChatStore((state) => state.activeSession);
  const setActiveSession = useChatStore((state) => state.setActiveSession);
  const loadMessages = useChatStore((state) => state.loadMessages);
  const scope = useSessionsStore((state) => state.scope);

  const [shouldScroll] = useState(true);
  const { scrollRef, contentRef } = useStickToBottom({
    stiffness: 1,
    damping: 0,
  });

  useEffect(() => {
    if (!id) return;

    const ref = {
      sessionId: id,
      projectName: scope.projectName,
      path: scope.path,
    };

    if (activeSession?.sessionId !== id) {
      setActiveSession(ref);
    }

    void loadMessages({ session: ref });
  }, [id]);

  return (
    <div
      className="no-scrollbar flex w-full flex-1 flex-col items-center overflow-y-auto px-8"
      ref={shouldScroll ? scrollRef : undefined}
    >
      <div className="mx-auto w-full max-w-(--breakpoint-md) pb-[200px] px-2 pt-2" ref={contentRef}>
        <ChatMessages />
      </div>
    </div>
  );
}
