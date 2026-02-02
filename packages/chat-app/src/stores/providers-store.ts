'use client';

import { create } from 'zustand';

import type { ProviderInfo } from '@/lib/contracts';
import type { Api, Model } from '@ank1015/llm-sdk';

import { getModelsCatalog, getProvidersCatalog } from '@/lib/client-api';

type ProvidersStoreState = {
  providers: ProviderInfo[];
  models: Model<Api>[];
  modelsByApi: Partial<Record<Api, Model<Api>[]>>;
  selectedApi: Api | null;
  selectedModelId: string | null;
  isLoadingProviders: boolean;
  isLoadingModels: boolean;
  isRefreshing: boolean;
  error: string | null;
  fetchProviders: () => Promise<void>;
  fetchModels: () => Promise<void>;
  refreshCatalog: () => Promise<void>;
  setSelectedApi: (api: Api | null) => void;
  setSelectedModelId: (modelId: string | null) => void;
  clearError: () => void;
  reset: () => void;
};

const initialState = {
  providers: [] as ProviderInfo[],
  models: [] as Model<Api>[],
  modelsByApi: {} as Partial<Record<Api, Model<Api>[]>>,
  selectedApi: null as Api | null,
  selectedModelId: null as string | null,
  isLoadingProviders: false,
  isLoadingModels: false,
  isRefreshing: false,
  error: null as string | null,
};

let providersRequestId = 0;
let modelsRequestId = 0;
let refreshRequestId = 0;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Unexpected providers/models error.';
}

function groupModelsByApi(models: Model<Api>[]): Partial<Record<Api, Model<Api>[]>> {
  const grouped: Partial<Record<Api, Model<Api>[]>> = {};

  for (const model of models) {
    const existing = grouped[model.api] ?? [];
    grouped[model.api] = [...existing, model];
  }

  return grouped;
}

function resolveSelection(params: {
  providers: ProviderInfo[];
  modelsByApi: Partial<Record<Api, Model<Api>[]>>;
  selectedApi: Api | null;
  selectedModelId: string | null;
}): Pick<ProvidersStoreState, 'selectedApi' | 'selectedModelId'> {
  const { providers, modelsByApi } = params;
  let { selectedApi, selectedModelId } = params;

  if (!selectedApi || (modelsByApi[selectedApi] ?? []).length === 0) {
    const preferredProvider = providers.find(
      (provider) => provider.hasKey && provider.modelCount > 0
    );
    const fallbackProvider = providers.find((provider) => provider.modelCount > 0);
    selectedApi = preferredProvider?.api ?? fallbackProvider?.api ?? null;
  }

  if (!selectedApi) {
    return {
      selectedApi: null,
      selectedModelId: null,
    };
  }

  const modelsForApi = modelsByApi[selectedApi] ?? [];

  if (modelsForApi.length === 0) {
    return {
      selectedApi,
      selectedModelId: null,
    };
  }

  const selectedStillExists = selectedModelId
    ? modelsForApi.some((model) => model.id === selectedModelId)
    : false;

  if (!selectedStillExists) {
    selectedModelId = modelsForApi[0]?.id ?? null;
  }

  return {
    selectedApi,
    selectedModelId,
  };
}

async function fetchProvidersApi(): Promise<ProviderInfo[]> {
  const payload = await getProvidersCatalog();
  if (!Array.isArray(payload.providers)) {
    throw new Error('Malformed providers response.');
  }

  return payload.providers;
}

async function fetchModelsApi(): Promise<Model<Api>[]> {
  const payload = await getModelsCatalog();
  if (!Array.isArray(payload.models)) {
    throw new Error('Malformed models response.');
  }

  return payload.models;
}

export const useProvidersStore = create<ProvidersStoreState>((set) => ({
  ...initialState,

  fetchProviders: async () => {
    const requestId = ++providersRequestId;

    set({
      isLoadingProviders: true,
      error: null,
    });

    try {
      const providers = await fetchProvidersApi();

      if (requestId !== providersRequestId) {
        return;
      }

      set((state) => {
        const selection = resolveSelection({
          providers,
          modelsByApi: state.modelsByApi,
          selectedApi: state.selectedApi,
          selectedModelId: state.selectedModelId,
        });

        return {
          providers,
          selectedApi: selection.selectedApi,
          selectedModelId: selection.selectedModelId,
          isLoadingProviders: false,
        };
      });
    } catch (error) {
      if (requestId !== providersRequestId) {
        return;
      }

      set({
        isLoadingProviders: false,
        error: getErrorMessage(error),
      });
    }
  },

  fetchModels: async () => {
    const requestId = ++modelsRequestId;

    set({
      isLoadingModels: true,
      error: null,
    });

    try {
      const models = await fetchModelsApi();
      const modelsByApi = groupModelsByApi(models);

      if (requestId !== modelsRequestId) {
        return;
      }

      set((state) => {
        const selection = resolveSelection({
          providers: state.providers,
          modelsByApi,
          selectedApi: state.selectedApi,
          selectedModelId: state.selectedModelId,
        });

        return {
          models,
          modelsByApi,
          selectedApi: selection.selectedApi,
          selectedModelId: selection.selectedModelId,
          isLoadingModels: false,
        };
      });
    } catch (error) {
      if (requestId !== modelsRequestId) {
        return;
      }

      set({
        isLoadingModels: false,
        error: getErrorMessage(error),
      });
    }
  },

  refreshCatalog: async () => {
    const requestId = ++refreshRequestId;

    set({
      isRefreshing: true,
      error: null,
    });

    try {
      const [providers, models] = await Promise.all([fetchProvidersApi(), fetchModelsApi()]);
      const modelsByApi = groupModelsByApi(models);

      if (requestId !== refreshRequestId) {
        return;
      }

      set((state) => {
        const selection = resolveSelection({
          providers,
          modelsByApi,
          selectedApi: state.selectedApi,
          selectedModelId: state.selectedModelId,
        });

        return {
          providers,
          models,
          modelsByApi,
          selectedApi: selection.selectedApi,
          selectedModelId: selection.selectedModelId,
          isLoadingProviders: false,
          isLoadingModels: false,
          isRefreshing: false,
        };
      });
    } catch (error) {
      if (requestId !== refreshRequestId) {
        return;
      }

      set({
        isRefreshing: false,
        isLoadingProviders: false,
        isLoadingModels: false,
        error: getErrorMessage(error),
      });
    }
  },

  setSelectedApi: (api) => {
    set((state) => {
      if (!api) {
        return {
          selectedApi: null,
          selectedModelId: null,
        };
      }

      const modelsForApi = state.modelsByApi[api] ?? [];
      const selectedModelStillValid =
        state.selectedApi === api &&
        state.selectedModelId !== null &&
        modelsForApi.some((model) => model.id === state.selectedModelId);

      return {
        selectedApi: api,
        selectedModelId: selectedModelStillValid
          ? state.selectedModelId
          : (modelsForApi[0]?.id ?? null),
      };
    });
  },

  setSelectedModelId: (modelId) => {
    set((state) => {
      if (!state.selectedApi) {
        return {
          selectedModelId: null,
        };
      }

      if (!modelId) {
        return {
          selectedModelId: null,
        };
      }

      const modelsForApi = state.modelsByApi[state.selectedApi] ?? [];
      const exists = modelsForApi.some((model) => model.id === modelId);

      return {
        selectedModelId: exists ? modelId : state.selectedModelId,
      };
    });
  },

  clearError: () => {
    set({ error: null });
  },

  reset: () => {
    set(initialState);
  },
}));

export type { ProviderInfo };
