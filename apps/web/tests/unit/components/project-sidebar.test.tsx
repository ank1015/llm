import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectSidebar } from '@/components/project-sidebar';
import { getBrowserQueryClient } from '@/lib/query-client';
import { useProjectPreferencesStore } from '@/stores/project-preferences-store';

const navigationState = vi.hoisted(() => ({
  pathname: '/project-1',
  params: {
    projectId: 'project-1',
  } as { projectId: string; artifactId?: string },
  push: vi.fn(),
}));

const projectState = vi.hoisted(() => ({
  artifacts: [
    {
      id: 'artifact-1',
      name: 'Artifact One',
      relativePath: 'artifact-one',
      createdAt: '2026-04-01T00:00:00.000Z',
      updatedAt: '2026-04-01T00:00:00.000Z',
    },
  ],
  createArtifact: {
    isPending: false,
    mutateAsync: vi.fn(),
  },
  renameArtifact: {
    isPending: false,
    mutateAsync: vi.fn().mockResolvedValue(undefined),
  },
  deleteArtifact: {
    isPending: false,
    mutateAsync: vi.fn().mockResolvedValue(undefined),
  },
}));

const explorerState = vi.hoisted(() => ({
  entriesByPath: {
    '': [
      {
        name: '.git',
        path: '.git',
        type: 'directory' as const,
        size: null,
        updatedAt: '2026-04-01T00:00:00.000Z',
      },
      {
        name: 'src',
        path: 'src',
        type: 'directory' as const,
        size: null,
        updatedAt: '2026-04-01T00:00:00.000Z',
      },
      {
        name: 'README.md',
        path: 'README.md',
        type: 'file' as const,
        size: 128,
        updatedAt: '2026-04-01T00:00:00.000Z',
      },
    ],
  } as Record<
    string,
    Array<{
      name: string;
      path: string;
      type: 'file' | 'directory';
      size: number | null;
      updatedAt: string;
    }>
  >,
}));

const uiState = vi.hoisted(() => ({
  isSidebarCollapsed: false,
  toggleSidebarCollapsed: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => navigationState.pathname,
  useParams: () => navigationState.params,
  useRouter: () => ({
    push: navigationState.push,
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/hooks/api/projects', () => ({
  useArtifactDirsQuery: () => ({
    data: projectState.artifacts,
    isPending: false,
  }),
  useArtifactExplorerQuery: (_ctx: unknown, path: string) => ({
    data: {
      path,
      entries: explorerState.entriesByPath[path] ?? [],
    },
    isPending: false,
    isError: false,
  }),
  useCreateArtifactDirMutation: () => projectState.createArtifact,
  useRenameArtifactDirMutation: () => projectState.renameArtifact,
  useDeleteArtifactDirMutation: () => projectState.deleteArtifact,
}));

vi.mock('@/hooks/api/sessions', () => ({
  useSessionsQuery: () => ({
    data: [],
    isPending: false,
    isError: false,
  }),
  useRenameSessionMutation: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
  useDeleteSessionMutation: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
}));

vi.mock('@/stores/ui-store', () => ({
  useUiStore: (
    selector: (state: {
      isSidebarCollapsed: boolean;
      toggleSidebarCollapsed: ReturnType<typeof vi.fn>;
    }) => unknown
  ) => selector(uiState),
}));

describe('ProjectSidebar', () => {
  beforeEach(() => {
    getBrowserQueryClient().clear();
    navigationState.pathname = '/project-1';
    navigationState.params = {
      projectId: 'project-1',
    };
    navigationState.push.mockClear();
    uiState.toggleSidebarCollapsed.mockClear();
    projectState.renameArtifact.mutateAsync.mockClear();
    projectState.deleteArtifact.mutateAsync.mockClear();
    useProjectPreferencesStore.getState().reset();
  });

  function renderSidebar() {
    return render(
      <QueryClientProvider client={getBrowserQueryClient()}>
        <ProjectSidebar />
      </QueryClientProvider>
    );
  }

  it('keeps the user on the project page when opening the artifact rename dialog', () => {
    renderSidebar();

    fireEvent.click(screen.getByRole('button', { name: /more options for artifact one/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /rename/i }));

    expect(navigationState.push).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: /rename artifact/i })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Artifact One')).toBeInTheDocument();
  });

  it('closes the dialog backdrop without navigating into the artifact', () => {
    renderSidebar();

    fireEvent.click(screen.getByRole('button', { name: /more options for artifact one/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /rename/i }));

    const dialog = screen.getByRole('dialog', { name: /rename artifact/i });
    fireEvent.click(dialog.parentElement as HTMLElement);

    expect(navigationState.push).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: /rename artifact/i })).not.toBeInTheDocument();
  });

  it('hides dot-prefixed folders in the file tree when advanced mode is off', () => {
    navigationState.pathname = '/project-1/artifact-1';
    navigationState.params = {
      projectId: 'project-1',
      artifactId: 'artifact-1',
    };

    renderSidebar();

    expect(screen.queryByText('.git')).not.toBeInTheDocument();
    expect(screen.getByText('src')).toBeInTheDocument();
    expect(screen.getByText('README.md')).toBeInTheDocument();
  });

  it('shows dot-prefixed folders in the file tree when advanced mode is on', () => {
    navigationState.pathname = '/project-1/artifact-1';
    navigationState.params = {
      projectId: 'project-1',
      artifactId: 'artifact-1',
    };
    useProjectPreferencesStore.getState().setProjectAdvancedMode('project-1', true);

    renderSidebar();

    expect(screen.getByText('.git')).toBeInTheDocument();
    expect(screen.getByText('src')).toBeInTheDocument();
  });
});
