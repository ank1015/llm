'use client';

import { X } from 'lucide-react';
import { memo } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores';

function SideDrawerComponent() {
  const sideDrawer = useUiStore((state) => state.sideDrawer);
  const dismissSideDrawer = useUiStore((state) => state.dismissSideDrawer);

  return (
    <div
      className={cn(
        'flex h-full flex-col transition-all duration-300 ease-in-out',
        sideDrawer.open ? 'w-[340px]' : 'w-0 overflow-hidden'
      )}
    >
      <div className="bg-home-page flex h-full w-[340px] flex-col p-3">
        {sideDrawer.open && (
          <div className="flex h-full flex-col">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-foreground text-base font-semibold">
                {typeof sideDrawer.title === 'function' ? sideDrawer.title() : sideDrawer.title}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={dismissSideDrawer}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X size={16} strokeWidth={2} />
              </Button>
            </div>
            <div className="no-scrollbar flex-1 overflow-y-auto">{sideDrawer.renderContent()}</div>
          </div>
        )}
      </div>
    </div>
  );
}

export const SideDrawer = memo(SideDrawerComponent);
