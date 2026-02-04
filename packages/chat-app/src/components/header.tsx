'use client';

import { ChevronDown, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

import { ModelPickerDialog } from './model-picker';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores';
import { useProvidersStore } from '@/stores/providers-store';

export function Header() {
  const theme = useUiStore((state) => state.theme);
  const toggleTheme = useUiStore((state) => state.toggleTheme);

  const selectedApi = useProvidersStore((state) => state.selectedApi);
  const selectedModelId = useProvidersStore((state) => state.selectedModelId);
  const modelsByApi = useProvidersStore((state) => state.modelsByApi);
  const refreshCatalog = useProvidersStore((state) => state.refreshCatalog);

  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);

  useEffect(() => {
    void refreshCatalog();
  }, [refreshCatalog]);

  let currentModelName = 'Select model';
  let currentProviderSlug: string | null = null;

  if (selectedApi && selectedModelId) {
    const models = modelsByApi[selectedApi];
    const model = models?.find((m) => m.id === selectedModelId);
    if (model) {
      currentModelName = model.name;
      currentProviderSlug = selectedApi;
    }
  }

  return (
    <header className="flex h-12 w-full shrink-0 items-center justify-between px-3">
      {/* Left — Model picker */}
      <button
        onClick={() => setIsModelPickerOpen(true)}
        className={cn(
          'text-foreground hover:bg-home-hover flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors'
        )}
      >
        {currentProviderSlug && (
          <img
            alt={`${currentProviderSlug} logo`}
            className="size-6 dark:invert"
            height={24}
            src={`https://models.dev/logos/${currentProviderSlug === 'kimi' ? 'moonshotai' : currentProviderSlug}.svg`}
            width={24}
          />
        )}
        <span className="max-w-[200px] text-[16px] truncate">{currentModelName}</span>
        <ChevronDown size={14} strokeWidth={2} className="text-muted-foreground" />
      </button>

      {/* Right — Theme toggle */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggleTheme}
          className="cursor-pointer text-muted-foreground hover:text-foreground"
        >
          {theme === 'light' ? (
            <Moon size={18} strokeWidth={1.8} />
          ) : (
            <Sun size={18} strokeWidth={1.8} />
          )}
        </Button>
      </div>

      <ModelPickerDialog open={isModelPickerOpen} onOpenChange={setIsModelPickerOpen} />
    </header>
  );
}
