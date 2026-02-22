'use client';

import { useState } from 'react';

import type { MockProject } from '@/lib/mock-data';

import { GitGraph } from '@/components/git-graph';
import { Sidebar } from '@/components/sidebar';
import { ThemeToggle } from '@/components/theme-toggle';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [selectedProject, setSelectedProject] = useState<MockProject | null>(null);

  return (
    <div className="bg-home-page flex h-dvh w-full overflow-hidden">
      <Sidebar onProjectSelect={setSelectedProject} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 w-full shrink-0 items-center justify-end px-3">
          <ThemeToggle />
        </header>
        <main className="relative flex-1 overflow-auto">
          {selectedProject ? <GitGraph project={selectedProject} /> : children}
        </main>
      </div>
    </div>
  );
}
