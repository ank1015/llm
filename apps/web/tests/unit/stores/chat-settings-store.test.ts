import { afterEach, describe, expect, it } from 'vitest';

import { CURATED_MODEL_IDS } from '@/lib/model-catalog';
import { CHAT_MODEL_OPTIONS, useChatSettingsStore } from '@/stores/chat-settings-store';

describe('chat settings store', () => {
  afterEach(() => {
    useChatSettingsStore.getState().reset();
    window.localStorage.clear();
  });

  function getModelIdsForApi(api: (typeof CHAT_MODEL_OPTIONS)[number]['api']) {
    return CHAT_MODEL_OPTIONS.filter((option) => option.api === api).map(
      (option) => option.modelId
    );
  }

  it('builds model options from the current curated model catalog', () => {
    expect(CHAT_MODEL_OPTIONS.map((option) => option.modelId)).toEqual(CURATED_MODEL_IDS);
  });

  it('stores reasoningEffort using current settings fields', () => {
    useChatSettingsStore.getState().setReasoning('low');

    const state = useChatSettingsStore.getState();
    expect(state.reasoningEffort).toBe('low');
    expect(state.reasoning).toBe('low');
  });

  it('enables all models when a provider is enabled', () => {
    const azureModelIds = getModelIdsForApi('azure-openai');

    const result = useChatSettingsStore.getState().setProviderEnabled({
      api: 'azure-openai',
      enabled: true,
      modelIds: azureModelIds,
    });

    expect(result).toEqual({ ok: true });

    const state = useChatSettingsStore.getState();
    expect(state.isProviderEnabled('azure-openai')).toBe(true);
    expect(azureModelIds.every((modelId) => state.isModelEnabled(modelId))).toBe(true);
  });

  it('prevents disabling the only active provider', () => {
    const azureModelIds = getModelIdsForApi('azure-openai');
    const [firstModelId, ...otherModelIds] = azureModelIds;
    expect(firstModelId).toBeDefined();
    if (!firstModelId) {
      return;
    }

    for (const modelId of otherModelIds) {
      useChatSettingsStore.getState().setModelEnabled({
        api: 'azure-openai',
        modelId,
        enabled: false,
      });
    }

    const result = useChatSettingsStore.getState().setProviderEnabled({
      api: 'azure-openai',
      enabled: false,
      modelIds: [firstModelId],
    });

    expect(result).toEqual({
      ok: false,
      reason: 'At least one active model must remain enabled.',
    });

    const state = useChatSettingsStore.getState();
    expect(state.isProviderEnabled('azure-openai')).toBe(true);
    expect(state.isModelEnabled(firstModelId)).toBe(true);
  });

  it('prevents disabling the selected model when it is the only active model', () => {
    const { api, modelId } = useChatSettingsStore.getState();

    const result = useChatSettingsStore.getState().setModelEnabled({
      api,
      modelId,
      enabled: false,
    });

    expect(result).toEqual({
      ok: false,
      reason: 'At least one active model must remain enabled.',
    });

    const state = useChatSettingsStore.getState();
    expect(state.modelId).toBe(modelId);
    expect(state.isModelEnabled(modelId)).toBe(true);
  });

  it('prevents disabling the last active model', () => {
    const defaultApi = useChatSettingsStore.getState().api;
    const defaultModelIds = getModelIdsForApi(defaultApi);
    const [lastModelId, ...otherModelIds] = defaultModelIds;

    for (const modelId of otherModelIds) {
      expect(
        useChatSettingsStore.getState().setModelEnabled({
          api: defaultApi,
          modelId,
          enabled: false,
        })
      ).toEqual({ ok: true });
    }

    const result = useChatSettingsStore.getState().setModelEnabled({
      api: defaultApi,
      modelId: lastModelId,
      enabled: false,
    });

    expect(result).toEqual({
      ok: false,
      reason: 'At least one active model must remain enabled.',
    });
    expect(useChatSettingsStore.getState().isModelEnabled(lastModelId)).toBe(true);
  });

  it('marks a provider inactive when its last enabled model is turned off', () => {
    const azureModelIds = getModelIdsForApi('azure-openai');
    const [lastModelId, ...otherModelIds] = azureModelIds;
    expect(lastModelId).toBeDefined();
    if (!lastModelId) {
      return;
    }

    for (const modelId of otherModelIds) {
      expect(
        useChatSettingsStore.getState().setModelEnabled({
          api: 'azure-openai',
          modelId,
          enabled: false,
        })
      ).toEqual({ ok: true });
    }

    expect(
      useChatSettingsStore.getState().setModelEnabled({
        api: 'azure-openai',
        modelId: lastModelId,
        enabled: false,
      })
    ).toEqual({
      ok: false,
      reason: 'At least one active model must remain enabled.',
    });
    expect(useChatSettingsStore.getState().isProviderEnabled('azure-openai')).toBe(true);
  });

  it('persists enabled providers and models to browser storage', () => {
    const azureModelIds = getModelIdsForApi('azure-openai');
    useChatSettingsStore.getState().setProviderEnabled({
      api: 'azure-openai',
      enabled: true,
      modelIds: azureModelIds,
    });

    const persisted = JSON.parse(window.localStorage.getItem('web-chat-settings-store') ?? '{}');

    expect(persisted.state.enabledProviders['azure-openai']).toBe(true);
    expect(persisted.state.enabledModels[azureModelIds[0]]).toBe(true);
  });
});
