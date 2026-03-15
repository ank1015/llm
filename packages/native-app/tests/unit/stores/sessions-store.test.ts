import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createSessionMock, deleteSessionMock, listSessionsMock, renameSessionMock } = vi.hoisted(
  () => ({
    createSessionMock: vi.fn(),
    deleteSessionMock: vi.fn(),
    listSessionsMock: vi.fn(),
    renameSessionMock: vi.fn(),
  })
);

vi.mock('@/lib/client-api', () => ({
  createSession: createSessionMock,
  deleteSession: deleteSessionMock,
  listSessions: listSessionsMock,
  renameSession: renameSessionMock,
}));

describe('sessions store', () => {
  beforeEach(async () => {
    vi.resetModules();
    createSessionMock.mockReset();
    deleteSessionMock.mockReset();
    listSessionsMock.mockReset();
    renameSessionMock.mockReset();
  });

  it('fetches sessions for an artifact', async () => {
    listSessionsMock.mockResolvedValue([
      {
        createdAt: '2026-03-16T00:00:00.000Z',
        nodeCount: 1,
        sessionId: 'session-1',
        sessionName: 'Session One',
        updatedAt: null,
      },
    ]);

    const { useSessionsStore } = await import('@/stores/sessions-store');
    await useSessionsStore.getState().fetchSessions({
      artifactId: 'artifact-1',
      projectId: 'project-1',
    });

    expect(useSessionsStore.getState().sessions).toEqual([
      expect.objectContaining({
        sessionId: 'session-1',
        sessionName: 'Session One',
      }),
    ]);
  });

  it('supports optimistic rename and remove operations', async () => {
    const { useSessionsStore } = await import('@/stores/sessions-store');

    useSessionsStore.setState({
      ...useSessionsStore.getState(),
      sessions: [
        {
          createdAt: '2026-03-16T00:00:00.000Z',
          nodeCount: 1,
          sessionId: 'session-1',
          sessionName: 'Session One',
          updatedAt: null,
        },
      ],
    });

    const store = useSessionsStore.getState();
    store.optimisticRenameSession('session-1', 'Session Renamed');
    store.optimisticRemoveSession('session-1');

    expect(useSessionsStore.getState().sessions).toEqual([]);
  });
});
