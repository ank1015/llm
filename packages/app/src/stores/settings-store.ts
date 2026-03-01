import { create } from 'zustand';

const MODELS = [
  'GPT-5.3-Codex',
  'GPT-5.3',
  'GPT-4.1',
  'Claude Opus 4.6',
  'Claude Sonnet 4.6',
  'Gemini 2.5 Pro',
] as const;

const REASONING_LEVELS = ['None', 'Low', 'Medium', 'High', 'Extra High'] as const;

type SettingsState = {
  selectedModel: string;
  selectedReasoning: string;
  availableModels: readonly string[];
  availableReasoningLevels: readonly string[];
  setSelectedModel: (model: string) => void;
  setSelectedReasoning: (level: string) => void;
};

export const useSettingsStore = create<SettingsState>((set) => ({
  selectedModel: MODELS[0],
  selectedReasoning: 'Extra High',
  availableModels: MODELS,
  availableReasoningLevels: REASONING_LEVELS,

  setSelectedModel: (model) => set({ selectedModel: model }),
  setSelectedReasoning: (level) => set({ selectedReasoning: level }),
}));
