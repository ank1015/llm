"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  type Api,
  type CuratedModelId,
  type ReasoningEffort,
} from "@ank1015/llm-sdk";

import {
  CURATED_MODEL_IDS,
  REASONING_EFFORTS,
  PROVIDER_LABELS,
  formatChatModelLabel,
  getApiForModelId,
} from "@/lib/model-catalog";

type ChatModelOption = {
  api: Api;
  modelId: CuratedModelId;
  label: string;
  group: string;
};

type ReasoningOption = {
  value: ReasoningEffort;
  label: string;
  disabled?: boolean;
};

type ToggleResult =
  | { ok: true }
  | {
      ok: false;
      reason: string;
    };

type ChatSettingsStoreState = {
  api: Api;
  modelId: CuratedModelId;
  reasoningEffort: ReasoningEffort;
  reasoning: ReasoningEffort;
  enabledProviders: Partial<Record<Api, boolean>>;
  enabledModels: Partial<Record<CuratedModelId, boolean>>;
  isProviderEnabled: (api: Api) => boolean;
  isModelEnabled: (modelId: CuratedModelId) => boolean;
  setModel: (modelId: CuratedModelId) => void;
  setReasoning: (reasoningEffort: ReasoningEffort) => void;
  setProviderEnabled: (input: {
    api: Api;
    enabled: boolean;
    modelIds: readonly CuratedModelId[];
  }) => ToggleResult;
  setModelEnabled: (input: {
    api: Api;
    modelId: CuratedModelId;
    enabled: boolean;
  }) => ToggleResult;
  reset: () => void;
};

const CHAT_SETTINGS_STORAGE_KEY = "web-chat-settings-store";

export const CHAT_MODEL_OPTIONS: readonly ChatModelOption[] = CURATED_MODEL_IDS.map((modelId) => {
  const api = getApiForModelId(modelId);
  return {
    api,
    modelId,
    group: PROVIDER_LABELS[api] ?? api,
    label: formatChatModelLabel(modelId),
  };
});

export const REASONING_OPTIONS: readonly ReasoningOption[] = REASONING_EFFORTS.map((value) => ({
  value,
  label: value === "xhigh" ? "XHigh" : value[0].toUpperCase() + value.slice(1),
}));

const DEFAULT_MODEL =
  CHAT_MODEL_OPTIONS.find((option) => option.modelId === "codex/gpt-5.4") ?? CHAT_MODEL_OPTIONS[0];
const DEFAULT_REASONING: ReasoningEffort = "xhigh";
const MODEL_IDS_BY_PROVIDER = CHAT_MODEL_OPTIONS.reduce(
  (groups, option) => {
    const existing = groups[option.api] ?? [];
    groups[option.api] = [...existing, option.modelId];
    return groups;
  },
  {} as Record<Api, CuratedModelId[]>,
);
const DEFAULT_PROVIDER_MODEL_IDS = MODEL_IDS_BY_PROVIDER[DEFAULT_MODEL.api] ?? [DEFAULT_MODEL.modelId];

function getModelOption(modelId: CuratedModelId): ChatModelOption {
  return CHAT_MODEL_OPTIONS.find((option) => option.modelId === modelId) ?? DEFAULT_MODEL;
}

function getActiveModelIds(
  enabledModels: Partial<Record<CuratedModelId, boolean>>,
): CuratedModelId[] {
  return CHAT_MODEL_OPTIONS.map((option) => option.modelId).filter(
    (modelId) => enabledModels[modelId] === true,
  );
}

function getActiveModelIdsForProvider(input: {
  api: Api;
  enabledModels: Partial<Record<CuratedModelId, boolean>>;
}): CuratedModelId[] {
  return (MODEL_IDS_BY_PROVIDER[input.api] ?? []).filter(
    (modelId) => input.enabledModels[modelId] === true,
  );
}

function buildEnabledProvidersFromModels(
  enabledModels: Partial<Record<CuratedModelId, boolean>>,
): Partial<Record<Api, boolean>> {
  const enabledProviders: Partial<Record<Api, boolean>> = {};

  for (const option of CHAT_MODEL_OPTIONS) {
    if (enabledModels[option.modelId] === true) {
      enabledProviders[option.api] = true;
    }
  }

  return enabledProviders;
}

function getNextSelectedModel(input: {
  enabledModels: Partial<Record<CuratedModelId, boolean>>;
  preferredModelId: CuratedModelId;
}): CuratedModelId {
  const activeModelIds = getActiveModelIds(input.enabledModels);
  if (activeModelIds.length === 0) {
    return DEFAULT_MODEL.modelId;
  }

  if (activeModelIds.includes(input.preferredModelId)) {
    return input.preferredModelId;
  }

  return activeModelIds[0];
}

function buildInitialState() {
  const enabledProviders: Partial<Record<Api, boolean>> = {
    [DEFAULT_MODEL.api]: true,
  };
  const enabledModels = Object.fromEntries(
    DEFAULT_PROVIDER_MODEL_IDS.map((modelId) => [modelId, true]),
  ) as Partial<Record<CuratedModelId, boolean>>;

  return {
    api: DEFAULT_MODEL.api,
    modelId: DEFAULT_MODEL.modelId,
    reasoningEffort: DEFAULT_REASONING,
    reasoning: DEFAULT_REASONING,
    enabledProviders,
    enabledModels,
  };
}

const initialState = buildInitialState();

function normalizePersistedState(
  state: Partial<Pick<
    ChatSettingsStoreState,
    "api" | "modelId" | "reasoningEffort" | "reasoning" | "enabledProviders" | "enabledModels"
  >>,
) {
  const enabledModels = state.enabledModels ?? initialState.enabledModels;
  const enabledProviders = buildEnabledProvidersFromModels(enabledModels);
  const selectedModelId = getNextSelectedModel({
    enabledModels,
    preferredModelId: state.modelId ?? initialState.modelId,
  });
  const selectedApi = getApiForModelId(selectedModelId);
  const reasoningEffort = state.reasoningEffort ?? initialState.reasoningEffort;

  return {
    api: selectedApi,
    modelId: selectedModelId,
    reasoningEffort,
    reasoning: state.reasoning ?? reasoningEffort,
    enabledProviders,
    enabledModels,
  };
}

export function getSelectedChatModel(selection: {
  api?: Api;
  modelId: CuratedModelId;
}): ChatModelOption {
  return CHAT_MODEL_OPTIONS.find((option) => option.modelId === selection.modelId) ?? DEFAULT_MODEL;
}

export function getReasoningOptions(selection: {
  api?: Api;
  modelId: CuratedModelId;
}): readonly ReasoningOption[] {
  void selection;
  return REASONING_OPTIONS;
}

export const useChatSettingsStore = create<ChatSettingsStoreState>()(
  persist(
    (set, get) => ({
      ...initialState,

      isProviderEnabled: (api) => get().enabledProviders[api] === true,

      isModelEnabled: (modelId) => get().enabledModels[modelId] === true,

      setModel: (modelId) => {
        if (!get().enabledModels[modelId]) {
          return;
        }

        const nextModel = getModelOption(modelId);
        set({
          api: nextModel.api,
          modelId: nextModel.modelId,
        });
      },

      setReasoning: (reasoningEffort) => {
        set({
          reasoningEffort,
          reasoning: reasoningEffort,
        });
      },

      setProviderEnabled: ({ api, enabled, modelIds }) => {
        const current = get();

        if (enabled) {
          const nextEnabledModels = { ...current.enabledModels };
          for (const modelId of modelIds) {
            nextEnabledModels[modelId] = true;
          }

          const nextSelectedModel = getNextSelectedModel({
            enabledModels: nextEnabledModels,
            preferredModelId: current.modelId,
          });

          set({
            enabledProviders: {
              ...current.enabledProviders,
              [api]: true,
            },
            enabledModels: nextEnabledModels,
            modelId: nextSelectedModel,
            api: getApiForModelId(nextSelectedModel),
          });

          return { ok: true };
        }

        const nextEnabledModels = { ...current.enabledModels };
        for (const modelId of modelIds) {
          nextEnabledModels[modelId] = false;
        }

        const remainingActiveModels = getActiveModelIds(nextEnabledModels);
        if (remainingActiveModels.length === 0) {
          return {
            ok: false,
            reason: "At least one active model must remain enabled.",
          };
        }

        const nextSelectedModel = getNextSelectedModel({
          enabledModels: nextEnabledModels,
          preferredModelId: current.modelId,
        });

        set({
          enabledProviders: {
            ...current.enabledProviders,
            [api]: false,
          },
          enabledModels: nextEnabledModels,
          modelId: nextSelectedModel,
          api: getApiForModelId(nextSelectedModel),
        });

        return { ok: true };
      },

      setModelEnabled: ({ api, modelId, enabled }) => {
        const current = get();
        const nextEnabledModels = {
          ...current.enabledModels,
          [modelId]: enabled,
        };

        const remainingActiveModels = getActiveModelIds(nextEnabledModels);
        if (!enabled && remainingActiveModels.length === 0) {
          return {
            ok: false,
            reason: "At least one active model must remain enabled.",
          };
        }

        const nextSelectedModel = getNextSelectedModel({
          enabledModels: nextEnabledModels,
          preferredModelId: current.modelId,
        });

        set({
          enabledProviders: {
            ...current.enabledProviders,
            ...(enabled ? { [api]: true } : {}),
            ...(!enabled && getActiveModelIdsForProvider({
              api,
              enabledModels: nextEnabledModels,
            }).length === 0
              ? { [api]: false }
              : {}),
          },
          enabledModels: nextEnabledModels,
          modelId: nextSelectedModel,
          api: getApiForModelId(nextSelectedModel),
        });

        return { ok: true };
      },

      reset: () => {
        set(buildInitialState());
      },
    }),
    {
      name: CHAT_SETTINGS_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        api: state.api,
        modelId: state.modelId,
        reasoningEffort: state.reasoningEffort,
        reasoning: state.reasoning,
        enabledProviders: state.enabledProviders,
        enabledModels: state.enabledModels,
      }),
      migrate: (persistedState) => {
        const state =
          persistedState && typeof persistedState === "object"
            ? (persistedState as Partial<
                Pick<
                  ChatSettingsStoreState,
                  | "api"
                  | "modelId"
                  | "reasoningEffort"
                  | "reasoning"
                  | "enabledProviders"
                  | "enabledModels"
                >
              >)
            : {};

        return normalizePersistedState(state);
      },
    },
  ),
);

export type { ChatModelOption, ReasoningOption, ToggleResult };
