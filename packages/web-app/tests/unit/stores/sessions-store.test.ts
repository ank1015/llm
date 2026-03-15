import { afterEach, describe, expect, it } from 'vitest';

import type { SessionSummaryDto } from '@ank1015/llm-app-contracts';

import { useSessionsStore } from '@/stores/sessions-store';


const SESSION_A: SessionSummaryDto = {
  createdAt: '2026-03-16T00:00:00.000Z',
  nodeCount: 2,
  sessionId: 'session-a',
  sessionName: 'Alpha',
  updatedAt: null,
};

const SESSION_B: SessionSummaryDto = {
  createdAt: '2026-03-16T01:00:00.000Z',
  nodeCount: 1,
  sessionId: 'session-b',
  sessionName: 'Beta',
  updatedAt: null,
};

describe('sessions store', () => {
  afterEach(() => {
    useSessionsStore.getState().reset();
  });

  it('renames and removes sessions optimistically', () => {
    useSessionsStore.setState((state) => ({
      ...state,
      sessions: [SESSION_A, SESSION_B],
    }));

    useSessionsStore.getState().optimisticRenameSession('session-a', 'Renamed');
    useSessionsStore.getState().optimisticRemoveSession('session-b');

    expect(useSessionsStore.getState().sessions).toEqual([
      {
        ...SESSION_A,
        sessionName: 'Renamed',
      },
    ]);
  });

  it('upserts existing sessions and prepends new ones', () => {
    useSessionsStore.setState((state) => ({
      ...state,
      sessions: [SESSION_A],
    }));

    useSessionsStore.getState().upsertSession({
      ...SESSION_A,
      nodeCount: 5,
    });
    useSessionsStore.getState().upsertSession(SESSION_B);

    expect(useSessionsStore.getState().sessions).toEqual([
      SESSION_B,
      {
        ...SESSION_A,
        nodeCount: 5,
      },
    ]);
  });
});
