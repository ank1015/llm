'use client';

import { memo } from 'react';

import { SidebarHeader } from './sidebar-header';

import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores';

function SidebarComponent() {
  const isSidebarCollapsed = useUiStore((state) => state.isSidebarCollapsed);
  const toggleSidebarCollapsed = useUiStore((state) => state.toggleSidebarCollapsed);

  const handleContainerClick = () => {
    if (isSidebarCollapsed) {
      toggleSidebarCollapsed();
    }
  };

  return (
    <div
      onClick={handleContainerClick}
      className={cn(
        'relative bottom-0 left-0 top-0 z-[50] flex h-[100dvh] flex-shrink-0 flex-col py-2 transition-all duration-200',
        !isSidebarCollapsed ? 'top-0 h-full w-[230px]' : 'w-[50px]',
        `${isSidebarCollapsed && 'cursor-pointer'}`
      )}
    >
      <div className="w-full flex-1 flex flex-col items-start overflow-hidden">
        <SidebarHeader />
      </div>
    </div>
  );
}

// Memoize Sidebar to prevent unnecessary re-renders
export const Sidebar = memo(SidebarComponent);
