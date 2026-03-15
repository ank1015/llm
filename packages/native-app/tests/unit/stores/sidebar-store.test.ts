import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getProjectOverviewMock } = vi.hoisted(() => ({
  getProjectOverviewMock: vi.fn(),
}));

vi.mock('@/lib/client-api', () => ({
  getProjectOverview: getProjectOverviewMock,
}));

describe('sidebar store', () => {
  beforeEach(async () => {
    vi.resetModules();
    getProjectOverviewMock.mockReset();
  });

  it('hydrates project overview state from the shared DTO response', async () => {
    getProjectOverviewMock.mockResolvedValue({
      artifactDirs: [
        {
          createdAt: '2026-03-16T00:00:00.000Z',
          description: null,
          id: 'artifact-1',
          name: 'Artifact One',
          sessions: [],
        },
      ],
      project: {
        createdAt: '2026-03-16T00:00:00.000Z',
        description: null,
        id: 'project-1',
        name: 'Project One',
        projectImg: null,
      },
    });

    const { useSidebarStore } = await import('@/stores/sidebar-store');
    await useSidebarStore.getState().refreshOverview('project-1', { mode: 'initial' });

    expect(useSidebarStore.getState()).toMatchObject({
      artifactDirs: [
        expect.objectContaining({
          id: 'artifact-1',
          name: 'Artifact One',
        }),
      ],
      error: null,
      projectName: 'Project One',
    });
  });

  it('applies optimistic artifact and session updates locally', async () => {
    const { useSidebarStore } = await import('@/stores/sidebar-store');
    const store = useSidebarStore.getState();

    store.addArtifactDir({
      createdAt: '2026-03-16T00:00:00.000Z',
      description: null,
      id: 'artifact-1',
      name: 'Artifact One',
    });
    store.addSession('artifact-1', {
      createdAt: '2026-03-16T00:00:00.000Z',
      nodeCount: 0,
      sessionId: 'session-1',
      sessionName: 'Session One',
      updatedAt: null,
    });
    store.renameArtifactDir('artifact-1', 'Artifact Renamed');
    store.renameSession('session-1', 'Session Renamed');
    store.removeSession('artifact-1', 'session-1');

    expect(useSidebarStore.getState().artifactDirs).toEqual([
      expect.objectContaining({
        id: 'artifact-1',
        name: 'Artifact Renamed',
        sessions: [],
      }),
    ]);
  });
});
