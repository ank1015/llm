'use client';

import { useChatSettingsStore } from './chat-settings-store';
import { useChatStore } from './chat-store';
import { useComposerStore } from './composer-store';
import { useProvidersStore } from './providers-store';

import type { SessionRef } from '@/lib/contracts';

let coordinationInitialized = false;

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
}

if (typeof window !== 'undefined') {
  initializeStoreCoordination();
}
