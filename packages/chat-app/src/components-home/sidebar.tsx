'use client';

import { memo } from 'react';

import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores';

function SidebarComponent() {
  const isSidebarCollapsed = useUiStore((state) => state.isSidebarCollapsed);
  const toggleSidebarCollapsed = useUiStore((state) => state.toggleSidebarCollapsed);

  return (
    <div
      className={cn(
        'border-home-border flex h-full shrink-0 flex-col border-r transition-all duration-300 ease-in-out',
        isSidebarCollapsed ? 'w-[50px] bg-home-page' : 'w-[260px] bg-home-panel'
      )}
    >
      {isSidebarCollapsed ? (
        <div
          className="flex h-full cursor-pointer items-start justify-center pt-3"
          onClick={toggleSidebarCollapsed}
        >
          {/* Collapsed sidebar — clickable to expand */}
        </div>
      ) : (
        <div className="flex h-full w-full flex-col p-3">{/* Sidebar content will go here */}</div>
      )}
    </div>
  );
}

export const Sidebar = memo(SidebarComponent);
