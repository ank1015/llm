'use client';

import { Moon, PanelRight, Sun } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores';

export function Header() {
  const sideDrawer = useUiStore((state) => state.sideDrawer);
  const theme = useUiStore((state) => state.theme);
  const toggleTheme = useUiStore((state) => state.toggleTheme);
  const openSideDrawer = useUiStore((state) => state.openSideDrawer);
  const dismissSideDrawer = useUiStore((state) => state.dismissSideDrawer);

  const toggleSideDrawer = () => {
    if (sideDrawer.open) {
      dismissSideDrawer();
    } else {
      openSideDrawer({
        title: 'Details',
        renderContent: () => null,
      });
    }
  };

  return (
    <header className="flex h-12 w-full shrink-0 items-center justify-end px-3">
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggleTheme}
          className="cursor-pointer text-muted-foreground hover:text-foreground"
        >
          {theme === 'light' ? (
            <Moon size={18} strokeWidth={1.8} />
          ) : (
            <Sun size={18} strokeWidth={1.8} />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggleSideDrawer}
          className="cursor-pointer text-muted-foreground hover:text-foreground"
        >
          <PanelRight
            size={18}
            strokeWidth={1.8}
            className={cn('transition-transform duration-200', sideDrawer.open && 'scale-x-[-1]')}
          />
        </Button>
      </div>
    </header>
  );
}
