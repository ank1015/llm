'use client';

import type { ReactNode } from 'react';

import { Header } from '@/components/header';
import { SettingsDialog } from '@/components/settings-dialog';
import { SideDrawer } from '@/components/side-drawer';
import { Sidebar } from '@/components/sidebar';
import { ArtifactTerminalDock } from '@/components/terminal-dock';

export default function ProjectLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-home-page flex h-full min-h-0 w-full min-w-0 overflow-hidden">
      <Sidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Header />
        <main className="relative flex-1 min-h-0 min-w-0 overflow-hidden">{children}</main>
        <ArtifactTerminalDock />
      </div>
      <SettingsDialog />
      <SideDrawer />
    </div>
  );
}
