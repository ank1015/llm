'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { Frown, X } from 'lucide-react';
import { useStickToBottom } from 'use-stick-to-bottom';
import { Drawer } from 'vaul';

import { Sidebar } from './sidebar';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

import type { FC } from 'react';

import { useUiStore } from '@/stores';

export type TRootLayout = {
  children: React.ReactNode;
};

export const RootLayout: FC<TRootLayout> = ({ children }) => {
  return (
    <div className="bg-tertiary flex h-[100dvh] w-full flex-row overflow-hidden">
      <div className="bg-tertiary item-center fixed inset-0 z-[99999] flex justify-center md:hidden">
        <div className="flex flex-col items-center justify-center gap-2">
          <Frown size={24} strokeWidth={2} className="text-muted-foreground" />
          <span className="text-muted-foreground text-center text-sm">
            Mobile version is coming soon.
            <br /> Please use a desktop browser.
          </span>
        </div>
      </div>

      <div className="hidden lg:flex">
        <Sidebar />
      </div>

      <Drawer.Root direction="left" shouldScaleBackground>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-30 backdrop-blur-sm" />
          <Drawer.Content className="fixed bottom-0 left-0 top-0 z-[50]">
            <div className="pr-2">
              <Sidebar />
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      <div className="flex-1 overflow-hidden">
        <motion.div className="flex w-full py-1 pr-1">
          <div
            className={
              'relative flex flex-1 flex-row h-[calc(99dvh)] border border-border rounded-sm bg-secondary w-full overflow-hidden shadow-sm'
            }
          >
            <div className="relative flex h-full w-0 flex-1 flex-row">
              <div className="flex w-full flex-col gap-2 overflow-y-auto">{children}</div>
            </div>
            <SideDrawer />
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export const SideDrawer = () => {
  const sideDrawer = useUiStore((state) => state.sideDrawer);
  const dismissSideDrawer = useUiStore((state) => state.dismissSideDrawer);
  const { scrollRef, contentRef } = useStickToBottom({
    stiffness: 1,
    damping: 0,
  });

  const isThreadPage = true;

  return (
    <AnimatePresence>
      {sideDrawer.open && isThreadPage && (
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 40 }}
          transition={{
            type: 'spring',
            stiffness: 300,
            damping: 30,
            exit: { duration: 0.2 },
          }}
          className="flex min-h-[98dvh] w-[400px] shrink-0 flex-col overflow-hidden py-1.5 pl-0.5 pr-1.5"
        >
          <div className="bg-background border-border shadow-subtle-xs flex h-full w-full flex-col overflow-hidden rounded-lg">
            <div className="border-border flex flex-row items-center justify-between gap-2 border-b py-1.5 pl-4 pr-2">
              <div className="text-sm font-medium">
                {typeof sideDrawer.title === 'function' ? sideDrawer.title() : sideDrawer.title}
              </div>
              {sideDrawer.badge && <Badge variant="default">{sideDrawer.badge}</Badge>}
              <div className="flex-1" />
              <Button variant="outline" size="icon" onClick={() => dismissSideDrawer()}>
                <X size={14} strokeWidth={2} />
              </Button>
            </div>
            <div
              className="no-scrollbar flex flex-1 flex-col gap-2 overflow-y-auto p-2"
              ref={scrollRef}
            >
              <div ref={contentRef} className="w-full">
                {sideDrawer.renderContent()}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
