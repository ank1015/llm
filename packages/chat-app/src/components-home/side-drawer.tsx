'use client';

import { memo } from 'react';

import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores';

function SideDrawerComponent() {
  const sideDrawer = useUiStore((state) => state.sideDrawer);

  return (
    <div
      className={cn(
        'flex h-full flex-col transition-all duration-300 ease-in-out',
        sideDrawer.open ? 'w-[340px]' : 'w-0 overflow-hidden'
      )}
    >
      <div className="bg-home-panel flex h-full w-[340px] flex-col p-3">
        {sideDrawer.open && (
          <div className="flex h-full flex-col">
            <div className="mb-2 text-sm font-medium text-foreground">
              {typeof sideDrawer.title === 'function' ? sideDrawer.title() : sideDrawer.title}
            </div>
            <div className="flex-1 overflow-y-auto">{sideDrawer.renderContent()}</div>
          </div>
        )}
      </div>
    </div>
  );
}

export const SideDrawer = memo(SideDrawerComponent);
