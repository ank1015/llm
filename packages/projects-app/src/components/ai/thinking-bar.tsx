'use client';

import { ChevronRight } from 'lucide-react';

import { TextShimmer } from './text-shimmer';

import { cn } from '@/lib/utils';

type ThinkingBarProps = {
  className?: string;
  text?: string;
  onStop?: () => void;
  stopLabel?: string;
  onClick?: () => void;
  stop?: boolean;
};

export function ThinkingBar({
  className,
  text = 'Thinking',
  onStop,
  stopLabel = 'Answer now',
  onClick,
  stop = false,
}: ThinkingBarProps) {
  return (
    <div className={cn('flex w-full items-center justify-between', className)}>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="flex items-center gap-1 text-sm transition-opacity hover:opacity-80"
        >
          <TextShimmer className="font-medium" stop={stop}>
            {text}
          </TextShimmer>
          <ChevronRight className="text-muted-foreground size-4" />
        </button>
      ) : (
        <TextShimmer className="cursor-default font-medium" stop={stop}>
          {text}
        </TextShimmer>
      )}
      {onStop ? (
        <button
          onClick={onStop}
          type="button"
          className="text-muted-foreground hover:text-foreground border-muted-foreground/50 hover:border-foreground border-b border-dotted text-sm transition-colors"
        >
          {stopLabel}
        </button>
      ) : null}
    </div>
  );
}
