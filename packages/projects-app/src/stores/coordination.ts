'use client';

import { useChatStore } from './chat-store';
import { useComposerStore } from './composer-store';
import { useUiStore } from './ui-store';

import type { SessionRef } from '@/lib/contracts';

let coordinationInitialized = false;

function sameSession(a: SessionRef | null, b: SessionRef | null): boolean {
  if (a === b) {
    return true;
  }

  if (!a || !b) {
    return false;
  }

  return a.sessionId === b.sessionId;
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
      useUiStore.getState().dismissSideDrawer();
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
}

if (typeof window !== 'undefined') {
  initializeStoreCoordination();
}
