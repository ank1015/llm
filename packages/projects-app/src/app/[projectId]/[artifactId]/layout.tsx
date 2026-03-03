'use client';

import { useSelectedLayoutSegment } from 'next/navigation';

import type { ReactNode } from 'react';

import { ChatInput } from '@/components/chat-input';

export default function ArtifactLayout({ children }: { children: ReactNode }) {
  const segment = useSelectedLayoutSegment();
  const shouldShowChatInput = segment !== 'artifacts';

  return (
    <div className="relative flex h-full flex-col">
      {children}
      {shouldShowChatInput ? <ChatInput /> : null}
    </div>
  );
}
