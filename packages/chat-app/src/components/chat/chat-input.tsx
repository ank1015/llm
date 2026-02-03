'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { useParams } from 'next/navigation';

import { PromptInputWithActions } from './prompt-input';

import { cn } from '@/lib/utils';

export const ChatInput = () => {
  const { id } = useParams();
  const size = id ? 'base' : 'sm';

  const renderChatBottom = () => (
    <>
      <div className="items-center justify-center gap-2">{/* <ScrollButton /> */}</div>
      <PromptInputWithActions />
    </>
  );

  return (
    <div
      className={cn(
        'bg-secondary w-full',
        id
          ? 'absolute bottom-0'
          : 'absolute inset-0 flex h-full w-full flex-col items-center justify-center'
      )}
    >
      <div
        className={cn(
          'mx-auto flex w-full max-w-3xl flex-col items-start',
          size === 'sm' && 'px-8'
        )}
      >
        <div className={'w-full pb-4 items-start flex-col flex justify-start h-full'}>
          {!id && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="mb-4 flex w-full flex-col items-center gap-1"
            >
              <AnimatedTitles />
            </motion.div>
          )}

          {renderChatBottom()}
        </div>
      </div>
    </div>
  );
};

const AnimatedTitles = () => {
  const getTimeBasedGreeting = () => {
    const hour = new Date().getHours();

    if (hour >= 5 && hour < 12) {
      return 'Good morning';
    } else if (hour >= 12 && hour < 18) {
      return 'Good afternoon';
    } else {
      return 'Good evening';
    }
  };
  const greeting = getTimeBasedGreeting();

  return (
    <div className="relative h-[60px] w-full flex flex-col items-center justify-center overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.h1
          key={greeting}
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 5 }}
          transition={{
            duration: 0.8,
            ease: 'easeInOut',
          }}
          className="from-muted-foreground/90 via-muted-foreground/80 to-muted-foreground/60 bg-gradient-to-r bg-clip-text text-center text-[32px] font-semibold tracking-tight text-transparent"
        >
          {greeting}
        </motion.h1>
      </AnimatePresence>
    </div>
  );
};
