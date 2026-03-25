'use client';

import { getProviders } from '@ank1015/llm-core';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import type { KeyProviderStatusDto } from '@/lib/client-api';
import type { Api } from '@ank1015/llm-types';

import { Button } from '@/components/ui/button';
import { clearKey, getKeyDetails, listKeys, reloadKey, setKey } from '@/lib/client-api';
import { cn } from '@/lib/utils';


type SettingsKeysPanelProps = {
  enabled: boolean;
};

type ProviderRowState = {
  draftValue: string;
  isClearing: boolean;
  isEditing: boolean;
  isLoadingDetails: boolean;
  isReloading: boolean;
  isSaving: boolean;
};

const PROVIDER_PRIORITY: Api[] = ['codex', 'claude-code', 'google', 'openai', 'anthropic'];
const RELOADABLE_PROVIDERS = new Set<Api>(['codex', 'claude-code']);
const PROVIDER_LABELS: Partial<Record<Api, string>> = {
  anthropic: 'Anthropic',
  cerebras: 'Cerebras',
  'claude-code': 'Claude Code',
  codex: 'Codex',
  deepseek: 'DeepSeek',
  google: 'Google',
  kimi: 'Kimi',
  minimax: 'MiniMax',
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
  zai: 'Z.AI',
};

const ORDERED_PROVIDER_APIS = orderProviderApis(getProviders());

function orderProviderApis(providers: Api[]): Api[] {
  const priorityIndex = new Map(PROVIDER_PRIORITY.map((api, index) => [api, index]));

  return [...providers].sort((left, right) => {
    const leftPriority = priorityIndex.get(left);
    const rightPriority = priorityIndex.get(right);

    if (leftPriority !== undefined && rightPriority !== undefined) {
      return leftPriority - rightPriority;
    }

    if (leftPriority !== undefined) {
      return -1;
    }

    if (rightPriority !== undefined) {
      return 1;
    }

    return providers.indexOf(left) - providers.indexOf(right);
  });
}

function getProviderLabel(api: Api): string {
  return PROVIDER_LABELS[api] ?? api;
}

function getPrimaryCredentialField(api: Api): string {
  return api === 'claude-code' ? 'oauthToken' : 'apiKey';
}

function createDefaultRowState(): ProviderRowState {
  return {
    draftValue: '',
    isClearing: false,
    isEditing: false,
    isLoadingDetails: false,
    isReloading: false,
    isSaving: false,
  };
}

export function SettingsKeysPanel({ enabled }: SettingsKeysPanelProps) {
  const [providerStatuses, setProviderStatuses] = useState<
    Partial<Record<Api, KeyProviderStatusDto>>
  >({});
  const [rowStates, setRowStates] = useState<Partial<Record<Api, ProviderRowState>>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setProviderStatuses({});
      setRowStates({});
      setIsLoading(false);
      setLoadError(null);
      return;
    }

    let cancelled = false;

    async function loadStatuses() {
      setIsLoading(true);
      setLoadError(null);

      try {
        const providers = await listKeys();
        if (cancelled) {
          return;
        }

        setProviderStatuses(
          Object.fromEntries(providers.map((provider) => [provider.api, provider])) as Partial<
            Record<Api, KeyProviderStatusDto>
          >
        );
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : 'Failed to load keys');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadStatuses();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const setRowState = (api: Api, patch: Partial<ProviderRowState>) => {
    setRowStates((current) => ({
      ...current,
      [api]: {
        ...createDefaultRowState(),
        ...(current[api] ?? {}),
        ...patch,
      },
    }));
  };

  const resetRowState = (api: Api) => {
    setRowStates((current) => ({
      ...current,
      [api]: createDefaultRowState(),
    }));
  };

  const refreshStatuses = async () => {
    const providers = await listKeys();
    setProviderStatuses(
      Object.fromEntries(providers.map((provider) => [provider.api, provider])) as Partial<
        Record<Api, KeyProviderStatusDto>
      >
    );
  };

  const handleSet = async (api: Api) => {
    const providerLabel = getProviderLabel(api);
    const status = providerStatuses[api];
    const rowState = rowStates[api] ?? createDefaultRowState();

    if (!rowState.isEditing) {
      setRowState(api, { isLoadingDetails: true });

      try {
        const details = status?.hasKey ? await getKeyDetails(api) : { credentials: {} };
        setRowState(api, {
          draftValue: details.credentials[getPrimaryCredentialField(api)] ?? '',
          isEditing: true,
          isLoadingDetails: false,
        });
      } catch (error) {
        setRowState(api, { isLoadingDetails: false });
        toast.error(error instanceof Error ? error.message : `Failed to load ${providerLabel} key`);
      }

      return;
    }

    const draftValue = rowState.draftValue.trim();
    if (!draftValue) {
      toast.error(`Enter a key for ${providerLabel}`);
      return;
    }

    setRowState(api, { isSaving: true });

    try {
      await setKey(api, draftValue);
      await refreshStatuses();
      resetRowState(api);
      toast.success(`${providerLabel} key saved`);
    } catch (error) {
      setRowState(api, { isSaving: false });
      toast.error(error instanceof Error ? error.message : `Failed to save ${providerLabel} key`);
    }
  };

  const handleClear = async (api: Api) => {
    const providerLabel = getProviderLabel(api);
    setRowState(api, { isClearing: true });

    try {
      await clearKey(api);
      await refreshStatuses();
      resetRowState(api);
      toast.success(`${providerLabel} key cleared`);
    } catch (error) {
      setRowState(api, { isClearing: false });
      toast.error(error instanceof Error ? error.message : `Failed to clear ${providerLabel} key`);
    }
  };

  const handleReload = async (api: Api) => {
    const providerLabel = getProviderLabel(api);
    setRowState(api, { isReloading: true });

    try {
      await reloadKey(api);
      await refreshStatuses();
      resetRowState(api);
      toast.success(`${providerLabel} credentials loaded`);
    } catch (error) {
      setRowState(api, { isReloading: false });
      toast.error(
        error instanceof Error ? error.message : `Failed to load ${providerLabel} credentials`
      );
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="text-muted-foreground size-5 animate-spin" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="bg-home-panel border-home-border flex items-start gap-3 rounded-3xl border p-5">
        <AlertCircle className="mt-0.5 size-5 shrink-0 text-red-500" />
        <div className="min-w-0">
          <p className="text-foreground text-sm font-medium">Couldn&apos;t load keys</p>
          <p className="text-muted-foreground mt-1 text-sm leading-6">{loadError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {ORDERED_PROVIDER_APIS.map((api) => {
        const providerLabel = getProviderLabel(api);
        const primaryField = getPrimaryCredentialField(api);
        const status = providerStatuses[api];
        const rowState = rowStates[api] ?? createDefaultRowState();
        const isReloadable = RELOADABLE_PROVIDERS.has(api);
        const inputValue = rowState.isEditing
          ? rowState.draftValue
          : (status?.credentials?.[primaryField] ?? '');
        const isBusy =
          rowState.isLoadingDetails ||
          rowState.isSaving ||
          rowState.isReloading ||
          rowState.isClearing;
        const actionLabel = isReloadable ? (status?.hasKey ? 'Re-load' : 'Load') : 'Set';

        return (
          <div
            key={api}
            data-testid={`provider-row-${api}`}
            className="bg-home-panel border-home-border rounded-3xl border px-5 py-4"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
              <div className="min-w-0 lg:w-[170px] lg:shrink-0">
                <p className="text-foreground text-sm font-medium">{providerLabel}</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {status?.hasKey ? 'Configured' : 'Not configured'}
                </p>
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-3 md:flex-row md:items-center">
                <input
                  aria-label={`${providerLabel} key`}
                  value={inputValue}
                  onChange={(event) => setRowState(api, { draftValue: event.target.value })}
                  disabled={!rowState.isEditing || isBusy || isReloadable}
                  placeholder={isReloadable ? 'Use Load to import local auth' : 'No key set'}
                  className={cn(
                    'bg-home-page border-home-border text-foreground placeholder:text-muted-foreground min-w-0 flex-1 rounded-2xl border px-4 py-3 text-sm outline-none transition-colors',
                    rowState.isEditing && !isBusy
                      ? 'focus:border-foreground/20 focus:ring-1 focus:ring-foreground/20'
                      : 'cursor-default opacity-80'
                  )}
                />

                <div className="flex items-center gap-2 self-end md:self-auto">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void (isReloadable ? handleReload(api) : handleSet(api))}
                    disabled={isBusy}
                    className="cursor-pointer rounded-xl"
                  >
                    {(rowState.isLoadingDetails || rowState.isSaving || rowState.isReloading) && (
                      <Loader2 className="size-4 animate-spin" />
                    )}
                    {actionLabel}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => void handleClear(api)}
                    disabled={isBusy}
                    className="cursor-pointer rounded-xl"
                  >
                    {rowState.isClearing && <Loader2 className="size-4 animate-spin" />}
                    Clear
                  </Button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
