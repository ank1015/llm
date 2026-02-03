'use client';

import { CheckIcon } from 'lucide-react';
import { useState, useEffect } from 'react';

import type { Api, Model } from '@ank1015/llm-sdk';

import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorTrigger,
} from '@/components/ai/model-selector';
import { Button } from '@/components/ui/button';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { useChatSettingsStore } from '@/stores/chat-settings-store';
import { useProvidersStore } from '@/stores/providers-store';

export const ModelProvider = () => {
  return (
    <div className="flex items-center justify-between pt-2 px-4 absolute top-0 left-0 right-0 z-10">
      <ModelSelectorComponent />
    </div>
  );
};

const ModelSelectorComponent = () => {
  const [open, setOpen] = useState(false);

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

  useEffect(() => {
    void refreshCatalog();
  }, [refreshCatalog]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'i') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelectModel = (api: Api, model: Model<Api>): void => {
    setSelectedApi(api);
    setSelectedModelId(model.id);

    setGlobalApi(api);
    setGlobalModelId(model.id);
    setGlobalProviderOptions({});

    setOpen(false);
  };

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
    <ModelSelector onOpenChange={setOpen} open={open}>
      <ModelSelectorTrigger asChild>
        <Button
          className="w-[200px] justify-between flex flex-row items-center cursor-pointer"
          variant="outline"
        >
          <div className="flex min-w-0 items-center gap-2">
            {currentProviderSlug && (
              <ModelSelectorLogo provider={currentProviderSlug} className="shrink-0" />
            )}
            <span className="truncate">{currentModelName}</span>
          </div>
          <KbdGroup>
            <Kbd>⌘</Kbd>
            <span>+</span>
            <Kbd>I</Kbd>
          </KbdGroup>
        </Button>
      </ModelSelectorTrigger>
      <ModelSelectorContent>
        <ModelSelectorInput placeholder="Search models..." />
        <ModelSelectorList>
          <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
          {providers.map((provider) => {
            const models = modelsByApi[provider.api] ?? [];
            if (models.length === 0) return null;

            return (
              <ModelSelectorGroup
                heading={`${provider.api}${provider.hasKey ? '' : ' (no key)'}`}
                key={provider.api}
              >
                {models.map((model) => (
                  <ModelSelectorItem
                    key={model.id}
                    onSelect={() => handleSelectModel(provider.api, model)}
                    value={model.id}
                  >
                    <ModelSelectorLogo provider={provider.api} />
                    <ModelSelectorName>{model.name}</ModelSelectorName>
                    {selectedModelId === model.id && selectedApi === provider.api ? (
                      <CheckIcon className="ml-auto size-4" />
                    ) : (
                      <div className="ml-auto size-4" />
                    )}
                  </ModelSelectorItem>
                ))}
              </ModelSelectorGroup>
            );
          })}
        </ModelSelectorList>
      </ModelSelectorContent>
    </ModelSelector>
  );
};
