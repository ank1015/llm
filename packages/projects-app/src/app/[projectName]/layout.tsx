'use client';

import { Sidebar } from '@/components/sidebar';
import { ThemeToggle } from '@/components/theme-toggle';

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-home-page flex h-dvh w-full overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 w-full shrink-0 items-center justify-end px-3">
          <ThemeToggle />
        </header>
        <main className="relative flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
