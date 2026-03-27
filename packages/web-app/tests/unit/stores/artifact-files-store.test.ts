import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useArtifactFilesStore } from '@/stores/artifact-files-store';

const { getProjectFileIndexMock } = vi.hoisted(() => ({
  getProjectFileIndexMock: vi.fn(),
}));

vi.mock('@/lib/client-api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/client-api')>('@/lib/client-api');

  return {
    ...actual,
    getProjectFileIndex: getProjectFileIndexMock,
  };
});

describe('artifact-files store', () => {
  beforeEach(() => {
    getProjectFileIndexMock.mockReset();
    useArtifactFilesStore.setState({
      projectFileIndexByProject: {},
      projectFileIndexTruncatedByProject: {},
      projectFileIndexLoadingByProject: {},
      projectFileIndexErrorByProject: {},
    });
  });

  it('searchProjectFiles always fetches fresh results from the server', async () => {
    useArtifactFilesStore.setState({
      projectFileIndexByProject: {
        'project-1': [
          {
            artifactId: 'artifact-1',
            artifactName: 'Artifact 1',
            path: 'stale.txt',
            type: 'file',
            artifactPath: 'artifact-1/stale.txt',
            size: 10,
            updatedAt: '2026-03-27T00:00:00.000Z',
          },
        ],
      },
      projectFileIndexTruncatedByProject: {
        'project-1': false,
      },
    });

    const freshEntry = {
      artifactId: 'artifact-1',
      artifactName: 'Artifact 1',
      path: 'fresh.txt',
      type: 'file' as const,
      artifactPath: 'artifact-1/fresh.txt',
      size: 20,
      updatedAt: '2026-03-27T01:00:00.000Z',
    };

    getProjectFileIndexMock.mockResolvedValue({
      projectId: 'project-1',
      query: 'fresh',
      files: [freshEntry],
      truncated: false,
    });

    const result = await useArtifactFilesStore
      .getState()
      .searchProjectFiles('project-1', 'fresh', 25);

    expect(getProjectFileIndexMock).toHaveBeenCalledWith('project-1', {
      query: 'fresh',
      limit: 25,
    });
    expect(result).toEqual([freshEntry]);
  });
});
