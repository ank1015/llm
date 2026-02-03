'use client';

import { ChevronDown, Circle } from 'lucide-react';
import React from 'react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

export type ChainOfThoughtItemProps = React.ComponentProps<'div'>;

export const ChainOfThoughtItem = ({ children, className, ...props }: ChainOfThoughtItemProps) => (
  <div className={cn('text-muted-foreground text-sm', className)} {...props}>
    {children}
  </div>
);

export type ChainOfThoughtTriggerProps = React.ComponentProps<typeof CollapsibleTrigger> & {
  leftIcon?: React.ReactNode;
  swapIconOnHover?: boolean;
  hideChevron?: boolean;
};

export const ChainOfThoughtTrigger = ({
  children,
  className,
  leftIcon,
  swapIconOnHover = true,
  hideChevron = false,
  ...props
}: ChainOfThoughtTriggerProps) => (
  <CollapsibleTrigger
    className={cn(
      'group text-muted-foreground hover:text-foreground flex cursor-pointer items-center justify-start gap-1 text-left text-sm transition-colors',
      className
    )}
    {...props}
  >
    <div className="flex items-center gap-2">
      {leftIcon ? (
        <span className="relative inline-flex size-4 items-center justify-center">
          <span
            className={cn(
              'transition-opacity',
              swapIconOnHover && !hideChevron && 'group-hover:opacity-0'
            )}
          >
            {leftIcon}
          </span>
          {swapIconOnHover && !hideChevron && (
            <ChevronDown className="absolute size-4 opacity-0 transition-opacity group-hover:opacity-100 group-data-[state=open]:rotate-180" />
          )}
        </span>
      ) : (
        <span className="relative inline-flex size-4 items-center justify-center">
          <Circle className="size-2 fill-current" />
        </span>
      )}
      <span>{children}</span>
    </div>
    {!leftIcon && !hideChevron && (
      <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
    )}
  </CollapsibleTrigger>
);

export type ChainOfThoughtContentProps = React.ComponentProps<typeof CollapsibleContent>;

export const ChainOfThoughtContent = ({
  children,
  className,
  ...props
}: ChainOfThoughtContentProps) => {
  return (
    <CollapsibleContent
      className={cn(
        'text-popover-foreground data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down overflow-hidden',
        className
      )}
      {...props}
    >
      <div className="grid grid-cols-[min-content_minmax(0,1fr)] gap-x-4">
        <div className="bg-primary/20 ml-1.75 h-full w-px group-data-[last=true]:hidden" />
        <div className="ml-1.75 h-full w-px bg-transparent group-data-[last=false]:hidden" />
        <div className="mt-2 space-y-2">{children}</div>
      </div>
    </CollapsibleContent>
  );
};

export type ChainOfThoughtProps = {
  children: React.ReactNode;
  className?: string;
};

export function ChainOfThought({ children, className }: ChainOfThoughtProps) {
  const childrenArray = React.Children.toArray(children);

  return (
    <div className={cn('space-y-0', className)}>
      {childrenArray.map((child, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
        <React.Fragment key={index}>
          {React.isValidElement(child) &&
            React.cloneElement(child as React.ReactElement<ChainOfThoughtStepProps>, {
              isLast: index === childrenArray.length - 1,
            })}
        </React.Fragment>
      ))}
    </div>
  );
}

export type ChainOfThoughtStepProps = {
  children: React.ReactNode;
  className?: string;
  isLast?: boolean;
  collapsible?: boolean;
};

export const ChainOfThoughtStep = ({
  children,
  className,
  isLast = false,
  collapsible = true,
  ...props
}: ChainOfThoughtStepProps & React.ComponentProps<typeof Collapsible>) => {
  // Check if children includes a ChainOfThoughtTrigger
  const hasTrigger = React.Children.toArray(children).some(
    (child) => React.isValidElement(child) && child.type === ChainOfThoughtTrigger
  );

  // Clone children and pass hideChevron to triggers if not collapsible
  const processedChildren = !collapsible
    ? React.Children.map(children, (child) => {
        if (React.isValidElement(child) && child.type === ChainOfThoughtTrigger) {
          return React.cloneElement(child as React.ReactElement<ChainOfThoughtTriggerProps>, {
            hideChevron: true,
          });
        }
        return child;
      })
    : children;

  if (!hasTrigger) {
    // If no trigger, render without Collapsible (always open)
    return (
      <div className={cn('group', className)} data-last={isLast} data-state="open">
        {processedChildren}
        <div className="flex justify-start group-data-[last=true]:hidden">
          <div className="bg-primary/20 ml-1.75 h-4 w-px" />
        </div>
      </div>
    );
  }

  return (
    <Collapsible
      className={cn('group', className)}
      data-last={isLast}
      defaultOpen={true}
      {...props}
    >
      {processedChildren}
      <div className="flex justify-start group-data-[last=true]:hidden">
        <div className="bg-primary/20 ml-1.75 h-4 w-px" />
      </div>
    </Collapsible>
  );
};
