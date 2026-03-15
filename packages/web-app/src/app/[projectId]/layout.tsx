'use client';

import type { ReactNode } from 'react';

import { Header } from '@/components/header';
import { SideDrawer } from '@/components/side-drawer';
import { Sidebar } from '@/components/sidebar';

export default function ProjectLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-home-page flex h-full min-h-0 w-full min-w-0 overflow-hidden">
      <Sidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Header />
        <main className="relative flex-1 min-h-0 min-w-0 overflow-hidden">{children}</main>
      </div>
      <SideDrawer />
    </div>
  );
}
