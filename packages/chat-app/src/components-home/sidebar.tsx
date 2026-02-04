'use client';

import { Images, PanelLeft, Search, SquarePen } from 'lucide-react';
import Image from 'next/image';
import { memo, useState } from 'react';

import type { FC, ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores';

type SidebarItemProps = {
  icon: ReactNode;
  label: string;
  shortcut?: string;
  collapsed?: boolean;
  onClick?: () => void;
};

const SidebarItem: FC<SidebarItemProps> = ({ icon, label, shortcut, collapsed, onClick }) => {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group flex h-10 w-full items-center whitespace-nowrap rounded-lg pl-[8px] pr-3 text-sm text-foreground hover:bg-home-hover',
        !collapsed && 'cursor-pointer gap-2'
      )}
    >
      <span className="shrink-0">{icon}</span>
      {!collapsed && <span className="flex-1 text-left text-[14px]">{label}</span>}
      {!collapsed && shortcut && (
        <span className="text-muted-foreground text-xs opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          {shortcut}
        </span>
      )}
    </button>
  );
};

function SidebarComponent() {
  const isSidebarCollapsed = useUiStore((state) => state.isSidebarCollapsed);
  const toggleSidebarCollapsed = useUiStore((state) => state.toggleSidebarCollapsed);
  const theme = useUiStore((state) => state.theme);
  const [isHovered, setIsHovered] = useState(false);

  const logoSrc = theme === 'dark' ? '/logo-light.png' : '/logo-dark.png';
  const showToggleIcon = isSidebarCollapsed && isHovered;

  return (
    <div
      className={cn(
        'border-home-border flex h-full shrink-0 flex-col overflow-hidden border-r transition-all duration-300 ease-in-out',
        isSidebarCollapsed ? 'w-[50px] bg-home-page cursor-pointer' : 'w-[260px] bg-home-panel'
      )}
      onMouseEnter={() => isSidebarCollapsed && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => isSidebarCollapsed && toggleSidebarCollapsed()}
    >
      {/* Header — logo pinned at fixed left offset so it doesn't move on collapse */}
      <div className="flex items-center pt-3 pb-2 pl-[9px] pr-2">
        <div className="relative flex h-8 w-8 shrink-0 items-center justify-center">
          <Image
            src={logoSrc}
            alt="logo"
            width={22}
            height={22}
            className={cn(
              'absolute transition-opacity duration-200',
              showToggleIcon ? 'opacity-0' : 'opacity-100'
            )}
          />
          <PanelLeft
            size={18}
            strokeWidth={1.8}
            className={cn(
              'text-muted-foreground absolute scale-x-[-1] transition-opacity duration-200',
              showToggleIcon ? 'opacity-100' : 'opacity-0'
            )}
          />
        </div>

        <div className="flex-1" />

        {!isSidebarCollapsed && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              setIsHovered(false);
              toggleSidebarCollapsed();
            }}
            className="cursor-pointer text-muted-foreground hover:text-foreground"
          >
            <PanelLeft size={18} strokeWidth={1.8} />
          </Button>
        )}
      </div>

      {/* Navigation items — always rendered, icon position fixed via px-2 + pl-[8px] = 16px */}
      <div className="mt-2 flex flex-col gap-0.5 px-2">
        <SidebarItem
          icon={<SquarePen size={18} strokeWidth={1.8} />}
          label="New chat"
          shortcut="⇧⌘O"
          collapsed={isSidebarCollapsed}
        />
        <SidebarItem
          icon={<Search size={18} strokeWidth={1.8} />}
          label="Search chats"
          shortcut="⇧⌘K"
          collapsed={isSidebarCollapsed}
        />
        <SidebarItem
          icon={<Images size={18} strokeWidth={1.8} />}
          label="Images"
          collapsed={isSidebarCollapsed}
        />
      </div>

      {/* Spacer */}
      <div className="flex-1" />
    </div>
  );
}

export const Sidebar = memo(SidebarComponent);
