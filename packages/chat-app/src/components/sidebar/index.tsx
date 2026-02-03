'use client';

import { Settings, Plus, Search } from 'lucide-react';
import { memo, useState } from 'react';

import { Button } from '../ui/button';

import { ChatList } from './chat-list';
import { SearchChatsDialog } from './search-chats';
import { SidebarHeader } from './sidebar-header';

import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores';

function SidebarComponent() {
  const isSidebarCollapsed = useUiStore((state) => state.isSidebarCollapsed);
  const toggleSidebarCollapsed = useUiStore((state) => state.toggleSidebarCollapsed);
  const [searchOpen, setSearchOpen] = useState(false);

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
        <div className="flex flex-col gap-1 px-2 w-full mt-4 gap-2">
          <Button
            size={!isSidebarCollapsed ? 'sm' : 'icon-sm'}
            variant="outline"
            className={cn(
              // eslint-disable-next-line sonarjs/no-duplicate-string
              !isSidebarCollapsed && 'relative w-full',
              // eslint-disable-next-line sonarjs/no-duplicate-string
              'justify-center cursor-pointer'
            )}
            onClick={() => {}}
          >
            <Plus size={16} strokeWidth={2} />
            {!isSidebarCollapsed && 'New Chat'}
          </Button>
          <Button
            size={!isSidebarCollapsed ? 'sm' : 'icon-sm'}
            variant="outline"
            className={cn(
              !isSidebarCollapsed && 'relative w-full',
              'justify-center cursor-pointer'
            )}
            onClick={() => setSearchOpen(true)}
          >
            <Search size={10} strokeWidth={2} />
            {!isSidebarCollapsed && 'Search Chats'}
          </Button>
        </div>

        {!isSidebarCollapsed && (
          <div className="mt-4 flex w-full min-h-0 flex-1 flex-col overflow-hidden pt-2 pb-4">
            <p className="mb-2 px-3 text-[12px] text-muted-foreground">Your chats</p>
            <div className="flex-1 overflow-y-auto">
              <ChatList />
            </div>
          </div>
        )}

        <div className={cn('mt-auto w-full px-2 pb-2 justify-center')}>
          <Button
            size={!isSidebarCollapsed ? 'sm' : 'icon-sm'}
            variant="outline"
            className={cn(
              !isSidebarCollapsed && 'relative w-full',
              'justify-center cursor-pointer'
            )}
          >
            <Settings size={14} strokeWidth={2} />
            {!isSidebarCollapsed && 'Settings'}
          </Button>
        </div>
      </div>
      <SearchChatsDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}

// Memoize Sidebar to prevent unnecessary re-renders
export const Sidebar = memo(SidebarComponent);
