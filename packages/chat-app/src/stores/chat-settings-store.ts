'use client';

import { create } from 'zustand';

import type { SessionRef } from '@/lib/contracts';
import type { Api } from '@ank1015/llm-sdk';

type ChatSettings = {
  api: Api | null;
  modelId: string | null;
  systemPrompt: string;
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
  getEffectiveSettings: (session?: SessionRef) => ChatSettings;
  resetSessionSettings: (session: SessionRef) => void;
  reset: () => void;
};

const defaultSettings: ChatSettings = {
  api: null,
  modelId: null,
  systemPrompt: '',
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
    providerOptions: {
      ...globalSettings.providerOptions,
      ...sessionSettings.providerOptions,
    },
  };
}

export const useChatSettingsStore = create<ChatSettingsStoreState>((set, get) => ({
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
      const current = state.sessionSettingsBySession[sessionKey] ?? cloneSettings(defaultSettings);
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

  getEffectiveSettings: (session) => {
    const state = get();
    const resolvedSession = resolveSessionRef(session, state.activeSession);

    if (!resolvedSession) {
      return cloneSettings(state.globalSettings);
    }

    const sessionKey = getSessionKey(resolvedSession);
    const sessionSettings = state.sessionSettingsBySession[sessionKey];

    return mergeWithGlobal(sessionSettings, state.globalSettings);
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
}));

export type { ChatSettings, SessionRef };
