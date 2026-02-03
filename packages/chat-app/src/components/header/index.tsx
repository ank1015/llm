'use client';

import { CommandMenu } from './command-menu';
import { ModelProvider } from './model-provider';

export const Header = () => {
  return (
    <div className="flex items-center justify-between pt-2 px-4 absolute top-0 left-0 right-0 z-10">
      <ModelProvider />
      <CommandMenu />
    </div>
  );
};
