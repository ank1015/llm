'use client';

import { KeyRound, Settings, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
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
          <div className="flex items-center gap-3 px-5 py-4">
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
            <div className="flex items-center gap-2">
              <div className="bg-home-hover text-foreground flex size-8 items-center justify-center rounded-xl">
                <Settings size={16} strokeWidth={1.8} />
              </div>
              <span className="text-foreground text-sm font-medium">Settings</span>
            </div>
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
            <DialogHeader className="gap-2 text-left">
              <DialogTitle className="text-foreground text-[28px] leading-none">Keys</DialogTitle>
              <DialogDescription className="text-muted-foreground max-w-2xl text-sm leading-6">
                Configure provider credentials and connection settings here. This section is ready
                for the key management controls you want to add next.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="flex-1 overflow-auto px-8 py-7">
            <div className="bg-home-panel border-home-border rounded-3xl border p-6">
              <div className="flex items-start gap-4">
                <div className="bg-home-hover text-foreground flex size-12 shrink-0 items-center justify-center rounded-2xl">
                  <KeyRound size={20} strokeWidth={1.8} />
                </div>
                <div className="min-w-0">
                  <p className="text-foreground text-base font-medium">Keys panel placeholder</p>
                  <p className="text-muted-foreground mt-1 text-sm leading-6">
                    We now have the larger settings shell and a dedicated left navigation rail. Send
                    over the fields or actions you want in this `Keys` section and I&apos;ll wire
                    them in.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </DialogContent>
    </Dialog>
  );
}
