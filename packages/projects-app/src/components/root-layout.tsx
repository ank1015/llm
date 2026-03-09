'use client';

import { Header } from './header';
import { SideDrawer } from './side-drawer';
import { Sidebar } from './sidebar';
import { ThemeInit } from './theme-init';

import type { FC, ReactNode } from 'react';

export type HomeLayoutProps = {
  children: ReactNode;
};

export const HomeLayout: FC<HomeLayoutProps> = ({ children }) => {
  return (
    <>
      <ThemeInit />
      <div className="bg-home-page flex h-full min-h-0 w-full min-w-0 overflow-hidden">
        {/* Sidebar */}
        <Sidebar />

        {/* Main content area */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <Header />
          <main className="relative flex-1 min-h-0 min-w-0 overflow-hidden">{children}</main>
        </div>

        {/* Side drawer */}
        <SideDrawer />
      </div>
    </>
  );
};
