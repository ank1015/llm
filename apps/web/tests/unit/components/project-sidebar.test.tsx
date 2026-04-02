import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectSidebar } from '@/components/project-sidebar';

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
  useArtifactExplorerQuery: () => ({
    data: [],
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
    navigationState.pathname = '/project-1';
    navigationState.params = {
      projectId: 'project-1',
    };
    navigationState.push.mockClear();
    uiState.toggleSidebarCollapsed.mockClear();
    projectState.renameArtifact.mutateAsync.mockClear();
    projectState.deleteArtifact.mutateAsync.mockClear();
  });

  it('keeps the user on the project page when opening the artifact rename dialog', () => {
    render(<ProjectSidebar />);

    fireEvent.click(screen.getByRole('button', { name: /more options for artifact one/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /rename/i }));

    expect(navigationState.push).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: /rename artifact/i })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Artifact One')).toBeInTheDocument();
  });

  it('closes the dialog backdrop without navigating into the artifact', () => {
    render(<ProjectSidebar />);

    fireEvent.click(screen.getByRole('button', { name: /more options for artifact one/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /rename/i }));

    const dialog = screen.getByRole('dialog', { name: /rename artifact/i });
    fireEvent.click(dialog.parentElement as HTMLElement);

    expect(navigationState.push).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: /rename artifact/i })).not.toBeInTheDocument();
  });
});
