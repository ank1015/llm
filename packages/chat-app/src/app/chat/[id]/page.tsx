'use client';

import { useParams } from 'next/navigation';
import { useEffect } from 'react';

import { useChatStore } from '@/stores/chat-store';
import { useSessionsStore } from '@/stores/sessions-store';

const ChatConversationPage = () => {
  const { id } = useParams<{ id: string }>();
  const activeSession = useChatStore((state) => state.activeSession);
  const setActiveSession = useChatStore((state) => state.setActiveSession);
  const loadMessages = useChatStore((state) => state.loadMessages);
  const scope = useSessionsStore((state) => state.scope);

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

  return <div></div>;
};

export default ChatConversationPage;
