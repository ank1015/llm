'use client';

import { create } from 'zustand';

import type { ModelSelection, ReasoningLevel } from '@/lib/client-api';

type ChatModelOption = ModelSelection & {
  label: string;
};

type ReasoningOption = {
  value: ReasoningLevel;
  label: string;
  disabled?: boolean;
};

type ChatSettingsStoreState = ModelSelection & {
  reasoning: ReasoningLevel;
  setModel: (modelId: string) => void;
  setReasoning: (reasoning: ReasoningLevel) => void;
  reset: () => void;
};

export const CHAT_MODEL_OPTIONS: readonly ChatModelOption[] = [
  {
    label: 'GPT-5.4',
    api: 'codex',
    modelId: 'gpt-5.4',
  },
  {
    label: 'Codex-5.3',
    api: 'codex',
    modelId: 'gpt-5.3-codex',
  },
  {
    label: 'Opus-4.6',
    api: 'claude-code',
    modelId: 'claude-opus-4-6',
  },
  {
    label: 'Sonnet-4.6',
    api: 'claude-code',
    modelId: 'claude-sonnet-4-6',
  },
  {
    label: 'Gemini-3.1',
    api: 'google',
    modelId: 'gemini-3.1-pro-preview',
  },
] as const;

export const REASONING_OPTIONS: readonly ReasoningOption[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'XHigh' },
] as const;

const DEFAULT_MODEL = CHAT_MODEL_OPTIONS[0];
const DEFAULT_REASONING: ReasoningLevel = 'xhigh';

function isGeminiModel(selection: ModelSelection): boolean {
  return selection.api === 'google' && selection.modelId === 'gemini-3.1-pro-preview';
}

function getModelOption(modelId: string): ChatModelOption {
  return CHAT_MODEL_OPTIONS.find((option) => option.modelId === modelId) ?? DEFAULT_MODEL;
}

function normalizeReasoning(selection: ModelSelection, reasoning: ReasoningLevel): ReasoningLevel {
  if (isGeminiModel(selection) && reasoning === 'xhigh') {
    return 'high';
  }

  return reasoning;
}

export function getSelectedChatModel(selection: ModelSelection): ChatModelOption {
  return (
    CHAT_MODEL_OPTIONS.find(
      (option) => option.api === selection.api && option.modelId === selection.modelId
    ) ?? DEFAULT_MODEL
  );
}

export function getReasoningOptions(selection: ModelSelection): readonly ReasoningOption[] {
  const geminiSelected = isGeminiModel(selection);

  return REASONING_OPTIONS.map((option) =>
    option.value === 'xhigh' && geminiSelected ? { ...option, disabled: true } : option
  );
}

const initialState = {
  api: DEFAULT_MODEL.api,
  modelId: DEFAULT_MODEL.modelId,
  reasoning: DEFAULT_REASONING,
};

export const useChatSettingsStore = create<ChatSettingsStoreState>((set) => ({
  ...initialState,

  setModel: (modelId) => {
    set((state) => {
      const nextModel = getModelOption(modelId);
      const nextSelection: ModelSelection = {
        api: nextModel.api,
        modelId: nextModel.modelId,
      };

      return {
        ...nextSelection,
        reasoning: normalizeReasoning(nextSelection, state.reasoning),
      };
    });
  },

  setReasoning: (reasoning) => {
    set((state) => ({
      reasoning: normalizeReasoning(
        {
          api: state.api,
          modelId: state.modelId,
        },
        reasoning
      ),
    }));
  },

  reset: () => {
    set(initialState);
  },
}));
