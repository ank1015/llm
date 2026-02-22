'use client';

import { Moon, Sun } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';

type Theme = 'light' | 'dark';

export function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme>('light');

  useEffect(() => {
    const stored = localStorage.getItem('theme');
    if (stored === 'dark' || stored === 'light') {
      applyTheme(stored);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      applyTheme('dark');
    }
  }, []);

  const applyTheme = (next: Theme) => {
    document.documentElement.classList.toggle('dark', next === 'dark');
    localStorage.setItem('theme', next);
    setThemeState(next);
  };

  const toggleTheme = useCallback(() => {
    applyTheme(theme === 'light' ? 'dark' : 'light');
  }, [theme]);

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
