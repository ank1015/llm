'use client';

import { useSelectedLayoutSegment } from 'next/navigation';

import type { ReactNode } from 'react';

import { ChatInput } from '@/components/chat-input';

export default function ArtifactLayout({ children }: { children: ReactNode }) {
  const segment = useSelectedLayoutSegment();
  const shouldShowChatInput = segment !== 'artifacts';

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{children}</div>
      {shouldShowChatInput ? <ChatInput /> : null}
    </div>
  );
}
