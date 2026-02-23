'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { useUiStore } from '@/stores';

export function ThemeToggle() {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);

  useEffect(() => {
    const stored = localStorage.getItem('theme');
    if (stored === 'dark' || stored === 'light') {
      setTheme(stored);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark');
    }
  }, [setTheme]);

  return (
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
  );
}
