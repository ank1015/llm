import { afterEach, describe, expect, it } from "vitest";

import { CuratedModelIds } from "@ank1015/llm-sdk";

import {
  CHAT_MODEL_OPTIONS,
  useChatSettingsStore,
} from "@/stores/chat-settings-store";

describe("chat settings store", () => {
  afterEach(() => {
    useChatSettingsStore.getState().reset();
    window.localStorage.clear();
  });

  function getModelIdsForApi(api: (typeof CHAT_MODEL_OPTIONS)[number]["api"]) {
    return CHAT_MODEL_OPTIONS.filter((option) => option.api === api).map((option) => option.modelId);
  }

  it("builds model options from the current curated model catalog", () => {
    expect(CHAT_MODEL_OPTIONS.map((option) => option.modelId)).toEqual(CuratedModelIds);
  });

  it("stores reasoningEffort using current settings fields", () => {
    useChatSettingsStore.getState().setReasoning("low");

    const state = useChatSettingsStore.getState();
    expect(state.reasoningEffort).toBe("low");
    expect(state.reasoning).toBe("low");
  });

  it("enables all models when a provider is enabled", () => {
    const openaiModelIds = getModelIdsForApi("openai");

    const result = useChatSettingsStore.getState().setProviderEnabled({
      api: "openai",
      enabled: true,
      modelIds: openaiModelIds,
    });

    expect(result).toEqual({ ok: true });

    const state = useChatSettingsStore.getState();
    expect(state.isProviderEnabled("openai")).toBe(true);
    expect(openaiModelIds.every((modelId) => state.isModelEnabled(modelId))).toBe(true);
  });

  it("disables all models when a provider is disabled", () => {
    const openaiModelIds = getModelIdsForApi("openai");
    useChatSettingsStore.getState().setProviderEnabled({
      api: "openai",
      enabled: true,
      modelIds: openaiModelIds,
    });

    const result = useChatSettingsStore.getState().setProviderEnabled({
      api: "openai",
      enabled: false,
      modelIds: openaiModelIds,
    });

    expect(result).toEqual({ ok: true });

    const state = useChatSettingsStore.getState();
    expect(state.isProviderEnabled("openai")).toBe(false);
    expect(openaiModelIds.every((modelId) => !state.isModelEnabled(modelId))).toBe(true);
  });

  it("switches selection when the selected model is disabled", () => {
    const { api, modelId } = useChatSettingsStore.getState();

    const result = useChatSettingsStore.getState().setModelEnabled({
      api,
      modelId,
      enabled: false,
    });

    expect(result).toEqual({ ok: true });

    const state = useChatSettingsStore.getState();
    expect(state.modelId).not.toBe(modelId);
    expect(state.isModelEnabled(state.modelId)).toBe(true);
  });

  it("prevents disabling the last active model", () => {
    const defaultApi = useChatSettingsStore.getState().api;
    const defaultModelIds = getModelIdsForApi(defaultApi);
    const [lastModelId, ...otherModelIds] = defaultModelIds;

    for (const modelId of otherModelIds) {
      expect(
        useChatSettingsStore.getState().setModelEnabled({
          api: defaultApi,
          modelId,
          enabled: false,
        }),
      ).toEqual({ ok: true });
    }

    const result = useChatSettingsStore.getState().setModelEnabled({
      api: defaultApi,
      modelId: lastModelId,
      enabled: false,
    });

    expect(result).toEqual({
      ok: false,
      reason: "At least one active model must remain enabled.",
    });
    expect(useChatSettingsStore.getState().isModelEnabled(lastModelId)).toBe(true);
  });

  it("marks a provider inactive when its last enabled model is turned off", () => {
    const openaiModelIds = getModelIdsForApi("openai");
    useChatSettingsStore.getState().setProviderEnabled({
      api: "openai",
      enabled: true,
      modelIds: openaiModelIds,
    });

    for (const modelId of openaiModelIds) {
      expect(
        useChatSettingsStore.getState().setModelEnabled({
          api: "openai",
          modelId,
          enabled: false,
        }),
      ).toEqual({ ok: true });
    }

    expect(useChatSettingsStore.getState().isProviderEnabled("openai")).toBe(false);
  });

  it("persists enabled providers and models to browser storage", () => {
    const openaiModelIds = getModelIdsForApi("openai");
    useChatSettingsStore.getState().setProviderEnabled({
      api: "openai",
      enabled: true,
      modelIds: openaiModelIds,
    });

    const persisted = JSON.parse(window.localStorage.getItem("web-chat-settings-store") ?? "{}");

    expect(persisted.state.enabledProviders.openai).toBe(true);
    expect(persisted.state.enabledModels[openaiModelIds[0]]).toBe(true);
  });
});
