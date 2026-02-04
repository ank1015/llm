'use client';

import { useChatSettingsStore } from './chat-settings-store';
import { useChatStore } from './chat-store';
import { useComposerStore } from './composer-store';
import { useProvidersStore } from './providers-store';

import type { SessionRef } from '@/lib/contracts';
import type { Api } from '@ank1015/llm-sdk';

import { getDefaultProviderSettingsForApi } from '@/lib/models/default-settings';

let coordinationInitialized = false;

function getSessionKey(session: SessionRef): string {
  const projectName = session.projectName?.trim() || '';
  const path = session.path?.trim() || '';
  return `${projectName}::${path}::${session.sessionId}`;
}

function sameSession(a: SessionRef | null, b: SessionRef | null): boolean {
  if (a === b) {
    return true;
  }

  if (!a || !b) {
    return false;
  }

  return (
    a.sessionId === b.sessionId &&
    (a.projectName ?? '') === (b.projectName ?? '') &&
    (a.path ?? '') === (b.path ?? '')
  );
}

export function initializeStoreCoordination(): void {
  if (coordinationInitialized) {
    return;
  }

  coordinationInitialized = true;

  let syncingSession = false;
  const syncActiveSession = (session: SessionRef | null): void => {
    if (syncingSession) {
      return;
    }

    syncingSession = true;
    try {
      useComposerStore.getState().setActiveSession(session);
      useChatSettingsStore.getState().setActiveSession(session);
    } finally {
      syncingSession = false;
    }
  };

  syncActiveSession(useChatStore.getState().activeSession);

  useChatStore.subscribe((state, previous) => {
    if (sameSession(state.activeSession, previous.activeSession)) {
      return;
    }

    syncActiveSession(state.activeSession);
  });

  let syncingCatalog = false;

  const syncProvidersToSettings = (): void => {
    if (syncingCatalog) {
      return;
    }

    syncingCatalog = true;
    try {
      const providersState = useProvidersStore.getState();
      const settingsState = useChatSettingsStore.getState();
      const globalSettings = settingsState.globalSettings;

      if (providersState.selectedApi !== globalSettings.api) {
        settingsState.setGlobalApi(providersState.selectedApi);
      }

      if (providersState.selectedModelId !== globalSettings.modelId) {
        settingsState.setGlobalModelId(providersState.selectedModelId);
      }
    } finally {
      syncingCatalog = false;
    }
  };

  const syncSettingsToProviders = (): void => {
    if (syncingCatalog) {
      return;
    }

    syncingCatalog = true;
    try {
      const providersState = useProvidersStore.getState();
      const settingsState = useChatSettingsStore.getState();
      const globalSettings = settingsState.globalSettings;

      if (globalSettings.api !== providersState.selectedApi) {
        providersState.setSelectedApi(globalSettings.api);
      }

      if (globalSettings.modelId !== providersState.selectedModelId) {
        providersState.setSelectedModelId(globalSettings.modelId);
      }
    } finally {
      syncingCatalog = false;
    }
  };

  syncSettingsToProviders();
  syncProvidersToSettings();

  useProvidersStore.subscribe((state, previous) => {
    if (
      state.selectedApi === previous.selectedApi &&
      state.selectedModelId === previous.selectedModelId
    ) {
      return;
    }

    syncProvidersToSettings();
  });

  useChatSettingsStore.subscribe((state, previous) => {
    if (
      state.globalSettings.api === previous.globalSettings.api &&
      state.globalSettings.modelId === previous.globalSettings.modelId
    ) {
      return;
    }

    syncSettingsToProviders();
  });

  // When messages are loaded for the active session, sync model from last assistant message
  let lastSyncedKey: string | null = null;

  useChatStore.subscribe((state, previous) => {
    const session = state.activeSession;
    if (!session) return;

    const key = getSessionKey(session);
    const messages = state.messagesBySession[key];
    const prevMessages = previous.messagesBySession[key];

    // Only react when messages actually changed for this session
    if (messages === prevMessages) return;
    // Don't re-sync the same session if messages haven't changed identity
    if (key === lastSyncedKey && messages === prevMessages) return;

    if (!messages || messages.length === 0) return;

    // Find the last assistant message node
    for (let i = messages.length - 1; i >= 0; i--) {
      const node = messages[i];
      if (
        node?.type === 'message' &&
        node.message.role === 'assistant' &&
        node.api &&
        node.modelId
      ) {
        lastSyncedKey = key;
        const api = node.api as Api;
        const modelId = node.modelId;

        const providersState = useProvidersStore.getState();
        if (providersState.selectedApi !== api || providersState.selectedModelId !== modelId) {
          providersState.setSelectedApi(api);
          providersState.setSelectedModelId(modelId);

          const settingsState = useChatSettingsStore.getState();
          settingsState.setGlobalApi(api);
          settingsState.setGlobalModelId(modelId);
          settingsState.setGlobalProviderOptions(
            getDefaultProviderSettingsForApi(api) as Record<string, unknown>
          );
        }
        return;
      }
    }
  });
}

if (typeof window !== 'undefined') {
  initializeStoreCoordination();
}
