'use client';

import { useEffect } from 'react';

import { useUiStore } from '@/stores';

export function ThemeInit() {
  const setTheme = useUiStore((state) => state.setTheme);

  useEffect(() => {
    const stored = localStorage.getItem('theme');
    if (stored === 'dark' || stored === 'light') {
      setTheme(stored);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark');
    }
  }, [setTheme]);

  return null;
}
