import { afterEach, describe, expect, it } from 'vitest';

import type { ArtifactDirOverviewDto, SessionSummaryDto } from '@ank1015/llm-app-contracts';

import { useSidebarStore } from '@/stores/sidebar-store';


const SESSION: SessionSummaryDto = {
  createdAt: '2026-03-16T00:00:00.000Z',
  nodeCount: 1,
  sessionId: 'session-a',
  sessionName: 'Alpha',
  updatedAt: null,
};

const ARTIFACT: ArtifactDirOverviewDto = {
  createdAt: '2026-03-16T00:00:00.000Z',
  description: null,
  id: 'artifact-a',
  name: 'Artifact A',
  sessions: [],
};

describe('sidebar store', () => {
  afterEach(() => {
    useSidebarStore.setState({
      artifactDirs: [],
      isLoading: true,
      projectName: null,
    });
  });

  it('adds, renames, and removes sessions inside an artifact', () => {
    useSidebarStore.setState({
      artifactDirs: [ARTIFACT],
      isLoading: false,
      projectName: 'Project A',
    });

    useSidebarStore.getState().addSession('artifact-a', SESSION);
    useSidebarStore.getState().renameSession('session-a', 'Renamed');
    useSidebarStore.getState().removeSession('artifact-a', 'session-a');

    expect(useSidebarStore.getState().artifactDirs[0]?.sessions).toEqual([]);
  });
});
