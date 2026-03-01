'use client';

import type { ReactNode } from 'react';

import { ChatInput } from '@/components/chat-input';

export default function ArtifactLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex h-full flex-col">
      {children}
      <ChatInput />
    </div>
  );
}
