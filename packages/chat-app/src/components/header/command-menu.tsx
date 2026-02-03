'use client';

import { CommandIcon } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';

import { Button } from '@/components/ui/button';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandList,
} from '@/components/ui/command';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useChatSettingsStore } from '@/stores/chat-settings-store';
import { useProvidersStore } from '@/stores/providers-store';

export const CommandMenu = () => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const selectedApi = useProvidersStore((state) => state.selectedApi);

  return (
    <>
      <Button
        className="justify-between flex flex-row items-center cursor-pointer gap-2"
        onClick={() => setOpen(true)}
        variant="outline"
      >
        <div className="flex items-center gap-2">
          <CommandIcon className="size-4" />
          <span>Options</span>
        </div>
        <KbdGroup>
          <Kbd>⌘</Kbd>
          <span>+</span>
          <Kbd>K</Kbd>
        </KbdGroup>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Provider Options">
        <CommandInput placeholder="Search options..." />
        <CommandList>
          {selectedApi === 'anthropic' ? (
            <AnthropicOptions />
          ) : selectedApi === 'openai' ? (
            <OpenAIOptions />
          ) : (
            <CommandEmpty>No options found.</CommandEmpty>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
};

const AnthropicOptions = () => {
  const providerOptions = useChatSettingsStore((state) => state.globalSettings.providerOptions);
  const setOption = useChatSettingsStore((state) => state.setGlobalProviderOption);
  const clearOption = useChatSettingsStore((state) => state.clearGlobalProviderOption);

  const temperature =
    typeof providerOptions.temperature === 'number' ? providerOptions.temperature : 1;
  const maxTokens =
    typeof providerOptions.max_tokens === 'number' ? providerOptions.max_tokens : 4096;

  const thinking = providerOptions.thinking as
    | { type: 'enabled'; budget_tokens: number }
    | { type: 'disabled' }
    | undefined;
  const isThinkingEnabled = thinking?.type === 'enabled';
  const budgetTokens = isThinkingEnabled ? thinking.budget_tokens : 10000;

  const handleTemperatureChange = useCallback(
    (value: number[]) => {
      const v = value[0];
      if (v !== undefined) {
        setOption('temperature', v);
      }
    },
    [setOption]
  );

  const handleMaxTokensChange = useCallback(
    (value: number[]) => {
      const v = value[0];
      if (v !== undefined) {
        setOption('max_tokens', v);
      }
    },
    [setOption]
  );

  const handleThinkingToggle = useCallback(
    (checked: boolean) => {
      if (checked) {
        setOption('thinking', { type: 'enabled', budget_tokens: budgetTokens });
      } else {
        clearOption('thinking');
      }
    },
    [setOption, clearOption, budgetTokens]
  );

  const handleBudgetTokensChange = useCallback(
    (value: number[]) => {
      const v = value[0];
      if (v !== undefined) {
        setOption('thinking', { type: 'enabled', budget_tokens: v });
      }
    },
    [setOption]
  );

  return (
    <>
      <CommandGroup heading="Temperature">
        <div className="px-2 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Controls randomness</Label>
            <span className="text-xs font-mono tabular-nums">{temperature.toFixed(1)}</span>
          </div>
          <Slider
            min={0}
            max={2}
            step={0.1}
            value={[temperature]}
            onValueChange={handleTemperatureChange}
          />
        </div>
      </CommandGroup>

      <CommandGroup heading="Max Tokens">
        <div className="px-2 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Maximum response length</Label>
            <span className="text-xs font-mono tabular-nums">{maxTokens.toLocaleString()}</span>
          </div>
          <Slider
            min={1}
            max={128000}
            step={1024}
            value={[maxTokens]}
            onValueChange={handleMaxTokensChange}
          />
        </div>
      </CommandGroup>

      <CommandGroup heading="Extended Thinking">
        <div className="px-2 py-3 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Enable extended thinking</Label>
            <Switch checked={isThinkingEnabled} onCheckedChange={handleThinkingToggle} />
          </div>
          {isThinkingEnabled && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Budget tokens</Label>
                <span className="text-xs font-mono tabular-nums">
                  {budgetTokens.toLocaleString()}
                </span>
              </div>
              <Slider
                min={1024}
                max={128000}
                step={1024}
                value={[budgetTokens]}
                onValueChange={handleBudgetTokensChange}
              />
            </div>
          )}
        </div>
      </CommandGroup>
    </>
  );
};

const EFFORT_OPTIONS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const;
const SUMMARY_OPTIONS = ['auto', 'concise', 'detailed'] as const;

const OpenAIOptions = () => {
  const providerOptions = useChatSettingsStore((state) => state.globalSettings.providerOptions);
  const setOption = useChatSettingsStore((state) => state.setGlobalProviderOption);

  const maxOutputTokens =
    typeof providerOptions.max_output_tokens === 'number'
      ? providerOptions.max_output_tokens
      : 4096;

  const reasoning = providerOptions.reasoning as
    | { effort?: string | null; summary?: string | null }
    | undefined;
  const effort = reasoning?.effort ?? 'medium';
  const summary = reasoning?.summary ?? 'auto';

  const handleMaxOutputTokensChange = useCallback(
    (value: number[]) => {
      const v = value[0];
      if (v !== undefined) {
        setOption('max_output_tokens', v);
      }
    },
    [setOption]
  );

  const updateReasoning = useCallback(
    (patch: Record<string, string>) => {
      setOption('reasoning', { ...reasoning, ...patch });
    },
    [setOption, reasoning]
  );

  return (
    <>
      <CommandGroup heading="Max Output Tokens">
        <div className="px-2 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Maximum response length</Label>
            <span className="text-xs font-mono tabular-nums">
              {maxOutputTokens.toLocaleString()}
            </span>
          </div>
          <Slider
            min={1}
            max={128000}
            step={1024}
            value={[maxOutputTokens]}
            onValueChange={handleMaxOutputTokensChange}
          />
        </div>
      </CommandGroup>

      <CommandGroup heading="Reasoning Effort">
        <div className="px-2 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Controls reasoning depth</Label>
            <Select value={effort} onValueChange={(v) => updateReasoning({ effort: v })}>
              <SelectTrigger className="w-[120px] h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EFFORT_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt} className="text-xs">
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CommandGroup>

      <CommandGroup heading="Reasoning Summary">
        <div className="px-2 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Reasoning summary detail</Label>
            <Select value={summary} onValueChange={(v) => updateReasoning({ summary: v })}>
              <SelectTrigger className="w-[120px] h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUMMARY_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt} className="text-xs">
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CommandGroup>
    </>
  );
};
