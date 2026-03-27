import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ArtifactDirOverviewDto, ProjectOverviewDto } from '@ank1015/llm-app-contracts';
import type { MouseEvent, ReactNode } from 'react';

import { Sidebar } from '@/components/sidebar';
import { useArtifactFilesStore, useSidebarStore, useUiStore } from '@/stores';
import { useChatStore } from '@/stores/chat-store';

const { getProjectOverviewMock, renameArtifactDirMock, routerPush, routerRefresh, routerReplace } =
  vi.hoisted(() => ({
    getProjectOverviewMock: vi.fn(),
    renameArtifactDirMock: vi.fn(),
    routerPush: vi.fn(),
    routerRefresh: vi.fn(),
    routerReplace: vi.fn(),
  }));

const PROJECT_ID = 'project-1';
const ARTIFACT_ID = 'artifact-1';
const RENAMED_ARTIFACT_ID = 'artifact-2';
const THREAD_ID = 'thread-1';
const FIXTURE_TIMESTAMP = '2026-03-27T00:00:00.000Z';

vi.mock('next/image', () => ({
  default: () => <div data-testid="next-image" />,
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({
    projectId: PROJECT_ID,
    artifactId: ARTIFACT_ID,
    threadId: THREAD_ID,
  }),
  usePathname: () => `/${PROJECT_ID}/${ARTIFACT_ID}/${THREAD_ID}`,
  useRouter: () => ({
    push: routerPush,
    refresh: routerRefresh,
    replace: routerReplace,
  }),
}));

vi.mock('@/lib/client-api', () => ({
  createArtifactDir: vi.fn(),
  deleteArtifactDir: vi.fn(),
  deleteSession: vi.fn(),
  getProjectOverview: getProjectOverviewMock,
  renameArtifactDir: renameArtifactDirMock,
  renameSession: vi.fn(),
}));

vi.mock('@/lib/use-typewriter', () => ({
  useTypewriter: (value: string) => value,
}));

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onClick,
    disabled,
  }: {
    children: ReactNode;
    onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
}));

function resetStores(): void {
  useSidebarStore.setState({
    projectName: null,
    artifactDirs: [],
    isLoading: true,
  });
  useArtifactFilesStore.setState({
    directoriesByArtifact: {},
    filesByArtifact: {},
    selectedFileByArtifact: {},
    directoryLoadingByKey: {},
    fileLoadingByKey: {},
    directoryErrorByKey: {},
    fileErrorByKey: {},
    projectFileIndexByProject: {},
    projectFileIndexTruncatedByProject: {},
    projectFileIndexLoadingByProject: {},
    projectFileIndexErrorByProject: {},
  });
  useUiStore.getState().resetUi();
  useChatStore.setState({
    activeSession: null,
    messagesBySession: {},
    messageTreesBySession: {},
    persistedLeafNodeIdBySession: {},
    visibleLeafNodeIdBySession: {},
    liveRunBySession: {},
    lastSeqBySession: {},
    streamingAssistantBySession: {},
    pendingPromptsBySession: {},
    agentEventsBySession: {},
    isLoadingMessagesBySession: {},
    isStreamingBySession: {},
    errorsBySession: {},
  });
}

function buildOverview(artifact: ArtifactDirOverviewDto): ProjectOverviewDto {
  return {
    project: {
      id: PROJECT_ID,
      name: 'Project One',
      description: null,
      projectImg: null,
      createdAt: FIXTURE_TIMESTAMP,
    },
    artifactDirs: [artifact],
  };
}

describe('Sidebar', () => {
  beforeEach(() => {
    resetStores();
    routerPush.mockReset();
    routerRefresh.mockReset();
    routerReplace.mockReset();
    getProjectOverviewMock.mockReset();
    renameArtifactDirMock.mockReset();
  });

  it('renames the active artifact, clears stale file-index cache, and replaces the current URL', async () => {
    const initialArtifact: ArtifactDirOverviewDto = {
      id: ARTIFACT_ID,
      name: 'Artifact One',
      description: null,
      createdAt: FIXTURE_TIMESTAMP,
      sessions: [
        {
          sessionId: THREAD_ID,
          sessionName: 'Thread One',
          createdAt: FIXTURE_TIMESTAMP,
          updatedAt: null,
          nodeCount: 1,
        },
      ],
    };
    const renamedArtifact: ArtifactDirOverviewDto = {
      ...initialArtifact,
      id: RENAMED_ARTIFACT_ID,
      name: 'Renamed Artifact',
    };

    getProjectOverviewMock
      .mockResolvedValueOnce(buildOverview(initialArtifact))
      .mockResolvedValueOnce(buildOverview(renamedArtifact));
    renameArtifactDirMock.mockResolvedValue({
      id: RENAMED_ARTIFACT_ID,
      name: 'Renamed Artifact',
      description: null,
      createdAt: initialArtifact.createdAt,
    });

    useArtifactFilesStore.setState({
      directoriesByArtifact: {
        [`${PROJECT_ID}::${ARTIFACT_ID}`]: {
          '': {
            path: '',
            entries: [],
          },
        },
      },
      projectFileIndexByProject: {
        [PROJECT_ID]: [
          {
            artifactId: ARTIFACT_ID,
            artifactName: 'Artifact One',
            path: 'README.md',
            type: 'file',
            artifactPath: `${ARTIFACT_ID}/README.md`,
            size: 10,
            updatedAt: FIXTURE_TIMESTAMP,
          },
        ],
      },
    });

    render(<Sidebar />);

    expect(await screen.findByText('Artifact One')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Rename' })[0]!);

    const input = await screen.findByPlaceholderText('Artifact name');
    fireEvent.change(input, { target: { value: 'Renamed Artifact' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(renameArtifactDirMock).toHaveBeenCalledWith(PROJECT_ID, ARTIFACT_ID, {
        name: 'Renamed Artifact',
      });
    });
    await waitFor(() => {
      expect(routerReplace).toHaveBeenCalledWith(
        `/${PROJECT_ID}/${RENAMED_ARTIFACT_ID}/${THREAD_ID}`
      );
    });
    await waitFor(() => {
      expect(getProjectOverviewMock).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText('Renamed Artifact')).toBeInTheDocument();
    expect(screen.queryByText('Artifact One')).not.toBeInTheDocument();

    expect(
      useArtifactFilesStore.getState().directoriesByArtifact[`${PROJECT_ID}::${ARTIFACT_ID}`]
    ).toBe(undefined);
    expect(useArtifactFilesStore.getState().projectFileIndexByProject[PROJECT_ID]).toBe(undefined);
  });
});
