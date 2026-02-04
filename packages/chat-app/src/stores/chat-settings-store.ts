'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { SessionRef } from '@/lib/contracts';
import type { Api } from '@ank1015/llm-sdk';

import { createDefaultSystemPrompt } from '@/lib/models/default-settings';

type ChatSettings = {
  api: Api | null;
  modelId: string | null;
  systemPrompt: string;
  useWebSearch: boolean;
  providerOptions: Record<string, unknown>;
};

type ChatSettingsStoreState = {
  activeSession: SessionRef | null;
  globalSettings: ChatSettings;
  sessionSettingsBySession: Record<string, ChatSettings>;
  setActiveSession: (session: SessionRef | null) => void;
  setGlobalApi: (api: Api | null) => void;
  setGlobalModelId: (modelId: string | null) => void;
  setGlobalSystemPrompt: (systemPrompt: string) => void;
  setGlobalProviderOptions: (providerOptions: Record<string, unknown>) => void;
  setGlobalProviderOption: (key: string, value: unknown) => void;
  clearGlobalProviderOption: (key: string) => void;
  updateSessionSettings: (
    session: SessionRef | undefined,
    updater: (current: ChatSettings) => ChatSettings
  ) => void;
  setSessionApi: (api: Api | null, session?: SessionRef) => void;
  setSessionModelId: (modelId: string | null, session?: SessionRef) => void;
  setSessionSystemPrompt: (systemPrompt: string, session?: SessionRef) => void;
  setSessionProviderOptions: (
    providerOptions: Record<string, unknown>,
    session?: SessionRef
  ) => void;
  setSessionProviderOption: (key: string, value: unknown, session?: SessionRef) => void;
  clearSessionProviderOption: (key: string, session?: SessionRef) => void;
  setGlobalWebSearch: (useWebSearch: boolean) => void;
  setSessionWebSearch: (useWebSearch: boolean, session?: SessionRef) => void;
  getEffectiveSettings: (session?: SessionRef) => ChatSettings;
  resetSessionSettings: (session: SessionRef) => void;
  reset: () => void;
};

const defaultSettings: ChatSettings = {
  api: null,
  modelId: null,
  systemPrompt: '',
  useWebSearch: false,
  providerOptions: {},
};

const initialState = {
  activeSession: null as SessionRef | null,
  globalSettings: { ...defaultSettings },
  sessionSettingsBySession: {} as Record<string, ChatSettings>,
};

function normalizeText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function normalizeSessionRef(session: SessionRef): SessionRef {
  return {
    sessionId: session.sessionId,
    projectName: normalizeText(session.projectName),
    path: normalizeText(session.path),
  };
}

function getSessionKey(session: SessionRef): string {
  const normalized = normalizeSessionRef(session);
  return `${normalized.projectName ?? ''}::${normalized.path ?? ''}::${normalized.sessionId}`;
}

function resolveSessionRef(
  session: SessionRef | undefined,
  activeSession: SessionRef | null
): SessionRef | undefined {
  if (session) {
    return normalizeSessionRef(session);
  }

  if (activeSession) {
    return normalizeSessionRef(activeSession);
  }

  return undefined;
}

function cloneSettings(settings: ChatSettings): ChatSettings {
  return {
    api: settings.api,
    modelId: settings.modelId,
    systemPrompt: settings.systemPrompt,
    useWebSearch: settings.useWebSearch,
    providerOptions: { ...settings.providerOptions },
  };
}

function mergeWithGlobal(
  sessionSettings: ChatSettings | undefined,
  globalSettings: ChatSettings
): ChatSettings {
  if (!sessionSettings) {
    return cloneSettings(globalSettings);
  }

  return {
    api: sessionSettings.api ?? globalSettings.api,
    modelId: sessionSettings.modelId ?? globalSettings.modelId,
    systemPrompt: sessionSettings.systemPrompt,
    useWebSearch: sessionSettings.useWebSearch,
    providerOptions: {
      ...globalSettings.providerOptions,
      ...sessionSettings.providerOptions,
    },
  };
}

export const useChatSettingsStore = create<ChatSettingsStoreState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setActiveSession: (session) => {
        if (!session) {
          set({ activeSession: null });
          return;
        }

        const normalized = normalizeSessionRef(session);
        const key = getSessionKey(normalized);

        set((state) => ({
          activeSession: normalized,
          sessionSettingsBySession: {
            ...state.sessionSettingsBySession,
            [key]: state.sessionSettingsBySession[key] ?? cloneSettings(defaultSettings),
          },
        }));
      },

      setGlobalApi: (api) => {
        set((state) => ({
          globalSettings: {
            ...state.globalSettings,
            api,
          },
        }));
      },

      setGlobalModelId: (modelId) => {
        set((state) => ({
          globalSettings: {
            ...state.globalSettings,
            modelId,
          },
        }));
      },

      setGlobalSystemPrompt: (systemPrompt) => {
        set((state) => ({
          globalSettings: {
            ...state.globalSettings,
            systemPrompt,
          },
        }));
      },

      setGlobalProviderOptions: (providerOptions) => {
        set((state) => ({
          globalSettings: {
            ...state.globalSettings,
            providerOptions: { ...providerOptions },
          },
        }));
      },

      setGlobalProviderOption: (key, value) => {
        set((state) => ({
          globalSettings: {
            ...state.globalSettings,
            providerOptions: {
              ...state.globalSettings.providerOptions,
              [key]: value,
            },
          },
        }));
      },

      clearGlobalProviderOption: (key) => {
        set((state) => {
          const nextProviderOptions = { ...state.globalSettings.providerOptions };
          delete nextProviderOptions[key];

          return {
            globalSettings: {
              ...state.globalSettings,
              providerOptions: nextProviderOptions,
            },
          };
        });
      },

      updateSessionSettings: (session, updater) => {
        const resolvedSession = resolveSessionRef(session, get().activeSession);
        if (!resolvedSession) {
          return;
        }

        const sessionKey = getSessionKey(resolvedSession);

        set((state) => {
          const current =
            state.sessionSettingsBySession[sessionKey] ?? cloneSettings(defaultSettings);
          const updated = updater(current);

          return {
            sessionSettingsBySession: {
              ...state.sessionSettingsBySession,
              [sessionKey]: {
                ...updated,
                providerOptions: { ...updated.providerOptions },
              },
            },
          };
        });
      },

      setSessionApi: (api, session) => {
        get().updateSessionSettings(session, (current) => ({
          ...current,
          api,
        }));
      },

      setSessionModelId: (modelId, session) => {
        get().updateSessionSettings(session, (current) => ({
          ...current,
          modelId,
        }));
      },

      setSessionSystemPrompt: (systemPrompt, session) => {
        get().updateSessionSettings(session, (current) => ({
          ...current,
          systemPrompt,
        }));
      },

      setSessionProviderOptions: (providerOptions, session) => {
        get().updateSessionSettings(session, (current) => ({
          ...current,
          providerOptions: { ...providerOptions },
        }));
      },

      setSessionProviderOption: (key, value, session) => {
        get().updateSessionSettings(session, (current) => ({
          ...current,
          providerOptions: {
            ...current.providerOptions,
            [key]: value,
          },
        }));
      },

      clearSessionProviderOption: (key, session) => {
        get().updateSessionSettings(session, (current) => {
          const nextProviderOptions = { ...current.providerOptions };
          delete nextProviderOptions[key];

          return {
            ...current,
            providerOptions: nextProviderOptions,
          };
        });
      },

      setGlobalWebSearch: (useWebSearch) => {
        set((state) => ({
          globalSettings: {
            ...state.globalSettings,
            useWebSearch,
          },
        }));
      },

      setSessionWebSearch: (useWebSearch, session) => {
        get().updateSessionSettings(session, (current) => ({
          ...current,
          useWebSearch,
        }));
      },

      getEffectiveSettings: (session) => {
        const state = get();
        const resolvedSession = resolveSessionRef(session, state.activeSession);

        let merged: ChatSettings;

        if (!resolvedSession) {
          merged = cloneSettings(state.globalSettings);
        } else {
          const sessionKey = getSessionKey(resolvedSession);
          const sessionSettings = state.sessionSettingsBySession[sessionKey];
          merged = mergeWithGlobal(sessionSettings, state.globalSettings);
        }

        // When no custom system prompt is set, generate the default one
        // (computed at read-time so the date is always fresh)
        if (merged.systemPrompt.trim().length === 0) {
          merged.systemPrompt = createDefaultSystemPrompt(merged.useWebSearch);
        }

        return merged;
      },

      resetSessionSettings: (session) => {
        const normalized = normalizeSessionRef(session);
        const key = getSessionKey(normalized);

        set((state) => ({
          sessionSettingsBySession: {
            ...state.sessionSettingsBySession,
            [key]: cloneSettings(defaultSettings),
          },
        }));
      },

      reset: () => {
        set(initialState);
      },
    }),
    {
      name: 'chat-app-chat-settings-store',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        globalSettings: state.globalSettings,
        sessionSettingsBySession: state.sessionSettingsBySession,
      }),
    }
  )
);

export type { ChatSettings, SessionRef };
