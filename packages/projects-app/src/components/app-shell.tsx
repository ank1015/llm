'use client';

import { ThemeToggle } from '@/components/theme-toggle';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-home-page flex h-dvh w-full flex-col overflow-hidden">
      <header className="flex h-12 w-full shrink-0 items-center justify-end px-4">
        <ThemeToggle />
      </header>
      <main className="relative flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
