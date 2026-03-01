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
      <div className="bg-home-page flex h-dvh w-full overflow-hidden">
        {/* Sidebar */}
        <Sidebar />

        {/* Main content area */}
        <div className="flex min-w-0 flex-1 flex-col">
          <Header />
          <main className="relative flex-1 overflow-auto">{children}</main>
        </div>

        {/* Side drawer */}
        <SideDrawer />
      </div>
    </>
  );
};
