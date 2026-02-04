'use client';

import { Header } from './header';
import { SideDrawer } from './side-drawer';
import { Sidebar } from './sidebar';
import { ThemeInit } from './theme-init';

import type { FC, ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores';

export type HomeLayoutProps = {
  children: ReactNode;
};

export const HomeLayout: FC<HomeLayoutProps> = ({ children }) => {
  const sideDrawer = useUiStore((state) => state.sideDrawer);

  return (
    <>
      <ThemeInit />
      <div className="bg-home-page flex h-dvh w-full overflow-hidden">
        {/* Sidebar */}
        <Sidebar />

        {/* Main content area */}
        <div className="flex min-w-0 flex-1 flex-col">
          <Header />
          <main className="relative flex-1 overflow-auto">{children}</main>
        </div>

        {/* Side drawer border — visible when drawer is open */}
        <div
          className={cn(
            'bg-home-border w-px shrink-0 transition-opacity duration-300',
            sideDrawer.open ? 'opacity-100' : 'opacity-0'
          )}
        />

        {/* Side drawer */}
        <SideDrawer />
      </div>
    </>
  );
};
