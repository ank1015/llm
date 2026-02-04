'use client';

import { Check, X } from 'lucide-react';
import { useEffect, useRef } from 'react';

import type { Api, Model } from '@ank1015/llm-sdk';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { getDefaultProviderSettingsForApi } from '@/lib/models/default-settings';
import { cn } from '@/lib/utils';
import { useChatSettingsStore } from '@/stores/chat-settings-store';
import { useProvidersStore } from '@/stores/providers-store';

type ModelPickerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function ProviderLogo({ provider, className }: { provider: string; className?: string }) {
  return (
    <img
      alt={`${provider} logo`}
      className={cn('size-4 dark:invert', className)}
      height={16}
      src={`https://models.dev/logos/${provider === 'kimi' ? 'moonshotai' : provider}.svg`}
      width={16}
    />
  );
}

export function ModelPickerDialog({ open, onOpenChange }: ModelPickerDialogProps) {
  const providers = useProvidersStore((state) => state.providers);
  const modelsByApi = useProvidersStore((state) => state.modelsByApi);
  const selectedApi = useProvidersStore((state) => state.selectedApi);
  const selectedModelId = useProvidersStore((state) => state.selectedModelId);
  const setSelectedApi = useProvidersStore((state) => state.setSelectedApi);
  const setSelectedModelId = useProvidersStore((state) => state.setSelectedModelId);
  const refreshCatalog = useProvidersStore((state) => state.refreshCatalog);

  const setGlobalApi = useChatSettingsStore((state) => state.setGlobalApi);
  const setGlobalModelId = useChatSettingsStore((state) => state.setGlobalModelId);
  const setGlobalProviderOptions = useChatSettingsStore((state) => state.setGlobalProviderOptions);

  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      void refreshCatalog();
    }
  }, [open, refreshCatalog]);

  // Scroll to selected model when dialog opens and models are loaded
  useEffect(() => {
    if (!open || !selectedModelId) return;
    const timer = setTimeout(() => {
      const el = listRef.current?.querySelector('[data-model-selected="true"]');
      el?.scrollIntoView({ block: 'center' });
    }, 50);
    return () => clearTimeout(timer);
  }, [open, selectedModelId, providers]);

  const handleSelectModel = (api: Api, model: Model<Api>) => {
    setSelectedApi(api);
    setSelectedModelId(model.id);
    setGlobalApi(api);
    setGlobalModelId(model.id);
    setGlobalProviderOptions(getDefaultProviderSettingsForApi(api) as Record<string, unknown>);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-home-page border-home-border h-[400px] gap-0 overflow-hidden p-0 sm:max-w-xl"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Select Model</DialogTitle>
        <Command className="bg-home-page **:data-[slot=command-input-wrapper]:border-home-border [&_[data-slot=command-input-wrapper]_svg]:hidden">
          {/* Search input with X close button */}
          <div className="relative py-2">
            <CommandInput
              placeholder="Search models..."
              className="py-[30px] px-1 pr-10 text-[16px]"
            />
            <button
              onClick={() => onOpenChange(false)}
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2 cursor-pointer"
            >
              <X size={18} strokeWidth={2} />
            </button>
          </div>

          <CommandList ref={listRef} className="max-h-none flex-1 p-1.5">
            <CommandEmpty className="text-muted-foreground py-6 text-center text-sm">
              No models found.
            </CommandEmpty>

            {providers.map((provider) => {
              const models = modelsByApi[provider.api] ?? [];
              if (models.length === 0) return null;

              return (
                <CommandGroup
                  key={provider.api}
                  heading={`${provider.api}${provider.hasKey ? '' : ' (no key)'}`}
                  className="[&_[cmdk-group-heading]]:text-muted-foreground/70 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-normal"
                >
                  {models.map((model) => {
                    const isSelected = selectedModelId === model.id && selectedApi === provider.api;

                    return (
                      <CommandItem
                        key={model.id}
                        value={`${provider.api}:${model.id}`}
                        onSelect={() => handleSelectModel(provider.api, model)}
                        data-model-selected={isSelected || undefined}
                        className={cn(
                          'hover:bg-home-hover data-[selected=true]:bg-home-hover flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5',
                          isSelected && 'bg-home-hover'
                        )}
                      >
                        <ProviderLogo provider={provider.api} className="shrink-0" />
                        <span className="text-foreground flex-1 truncate text-sm">
                          {model.name}
                        </span>
                        {isSelected && (
                          <Check size={16} strokeWidth={2} className="text-foreground shrink-0" />
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
