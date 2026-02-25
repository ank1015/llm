'use client';

import { Moon, Sun } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useUiStore } from '@/stores';

export function Header() {
  const theme = useUiStore((state) => state.theme);
  const toggleTheme = useUiStore((state) => state.toggleTheme);

  return (
    <header className="flex h-12 w-full shrink-0 items-center justify-between px-3">
      {/* Left — Model name */}
      <div className="flex items-center gap-2 px-2.5 py-1.5 text-sm">
        <span className="text-foreground text-[16px]">GPT-5.2</span>
      </div>

      {/* Right — Theme toggle */}
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
      </div>
    </header>
  );
}
