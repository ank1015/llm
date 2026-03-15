'use client';

import { Toaster as Sonner } from 'sonner';

import { useUiStore } from '@/stores';

export function Toaster(): React.ReactElement {
  const theme = useUiStore((state) => state.theme);

  return (
    <Sonner
      theme={theme}
      position="top-center"
      closeButton
      toastOptions={{
        className: 'border-home-border bg-home-panel text-foreground',
      }}
    />
  );
}
