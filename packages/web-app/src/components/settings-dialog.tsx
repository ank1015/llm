'use client';

import { KeyRound, X } from 'lucide-react';

import { SettingsKeysPanel } from '@/components/settings-keys-panel';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores';

export function SettingsDialog() {
  const isSettingsOpen = useUiStore((state) => state.isSettingsOpen);
  const closeSettings = useUiStore((state) => state.closeSettings);
  const activeSettingsTab = useUiStore((state) => state.activeSettingsTab);
  const setActiveSettingsTab = useUiStore((state) => state.setActiveSettingsTab);

  const isKeysTab = activeSettingsTab === 'keys';

  return (
    <Dialog open={isSettingsOpen} onOpenChange={(open) => !open && closeSettings()}>
      <DialogContent
        className="bg-home-page border-home-border flex !h-[min(720px,calc(100vh-2rem))] !w-[min(1120px,calc(100vw-3rem))] !max-w-none overflow-hidden p-0 sm:!max-w-none"
        showCloseButton={false}
      >
        <aside className="bg-home-panel border-home-border flex w-[260px] shrink-0 flex-col border-r">
          <div className="px-5 py-4">
            <DialogClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-foreground cursor-pointer rounded-full"
              >
                <X size={16} strokeWidth={1.8} />
                <span className="sr-only">Close settings</span>
              </Button>
            </DialogClose>
          </div>

          <div className="px-3 pb-4">
            <button
              type="button"
              onClick={() => setActiveSettingsTab('keys')}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors',
                isKeysTab
                  ? 'bg-home-hover text-foreground'
                  : 'text-muted-foreground hover:bg-home-hover/70 hover:text-foreground'
              )}
            >
              <KeyRound size={16} strokeWidth={1.8} />
              <span>Keys</span>
            </button>
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <div className="border-home-border border-b px-8 py-7">
            <DialogHeader className="text-left">
              <DialogTitle className="text-foreground text-[28px] leading-none">Keys</DialogTitle>
            </DialogHeader>
          </div>

          <div className="flex-1 overflow-auto px-8 py-7">
            <SettingsKeysPanel enabled={isSettingsOpen && isKeysTab} />
          </div>
        </section>
      </DialogContent>
    </Dialog>
  );
}
