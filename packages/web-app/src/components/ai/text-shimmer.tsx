'use client';

import { cn } from '@/lib/utils';

export type TextShimmerProps = {
  as?: string;
  duration?: number;
  spread?: number;
  stop?: boolean;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLElement>;

export function TextShimmer({
  as = 'span',
  className,
  duration = 4,
  spread = 20,
  stop = false,
  children,
  ...props
}: TextShimmerProps) {
  const dynamicSpread = Math.min(Math.max(spread, 5), 45);
  const Component = as as React.ElementType;

  return (
    <Component
      className={cn(
        'bg-size-[200%_auto] bg-clip-text font-medium text-transparent cursor-pointer',
        !stop && 'animate-[shimmer_4s_infinite_linear]',
        className
      )}
      style={{
        backgroundImage: `linear-gradient(to right, var(--muted-foreground) ${50 - dynamicSpread}%, var(--foreground) 50%, var(--muted-foreground) ${50 + dynamicSpread}%)`,
        animationDuration: stop ? undefined : `${duration}s`,
        backgroundPosition: stop ? 'center center' : undefined,
      }}
      {...props}
    >
      {children}
    </Component>
  );
}
