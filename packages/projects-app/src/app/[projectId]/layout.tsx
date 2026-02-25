'use client';

import type { ReactNode } from 'react';

import { ChatInput } from '@/components/chat-input';
import { Header } from '@/components/header';
import { SideDrawer } from '@/components/side-drawer';
import { Sidebar } from '@/components/sidebar';


export default function ProjectLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-home-page flex h-dvh w-full overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="relative flex-1 overflow-auto">
          <div className="relative flex h-full w-full flex-col">{children}</div>
          <ChatInput />
        </main>
      </div>
      <SideDrawer />
    </div>
  );
}
