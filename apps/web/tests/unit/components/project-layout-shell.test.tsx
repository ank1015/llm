import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectLayoutShell } from '@/components/project-layout-shell';

const navigationState = vi.hoisted(() => ({
  pathname: '/project-1/artifact-1',
  params: {
    projectId: 'project-1',
    artifactId: 'artifact-1',
  } as { projectId: string; artifactId?: string },
}));

const previewState = vi.hoisted(() => ({
  previewModeByArtifact: {
    'project-1::artifact-1': null as 'file' | 'diff' | null,
  },
}));

const terminalState = vi.hoisted(() => ({
  dockByArtifact: {
    'project-1::artifact-1': {
      open: false,
    },
  } as Record<string, { open: boolean }>,
  toggleDock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => navigationState.pathname,
  useParams: () => navigationState.params,
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock('@/components/project-sidebar', () => ({
  ProjectSidebar: () => <div data-testid="project-sidebar" />,
}));

vi.mock('@/components/project-header-breadcrumb', () => ({
  ProjectHeaderBreadcrumb: () => <div data-testid="breadcrumb" />,
}));

vi.mock('@/components/theme-toggle', () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}));

vi.mock('@/components/settings-button', () => ({
  SettingsButton: () => <div data-testid="settings-button" />,
  getProjectSettingsReturnPathStorageKey: () => 'settings-return-path',
}));

vi.mock('@/components/artifact-checkpoint-controls', () => ({
  ArtifactCheckpointControls: ({ compact }: { compact?: boolean }) => (
    <div data-testid="checkpoint-controls" data-compact={compact ? 'true' : 'false'} />
  ),
}));

vi.mock('@/components/artifact-workspace', () => ({
  ArtifactPreviewDrawer: () => <div data-testid="preview-drawer" />,
  getClampedArtifactDrawerWidth: () => 420,
}));

vi.mock('@/components/artifact-command-menu', () => ({
  ArtifactCommandMenu: ({
    artifactId,
    enabled,
    projectId,
  }: {
    artifactId: string;
    enabled: boolean;
    projectId: string;
  }) => (
    <div
      data-testid="artifact-command-menu"
      data-artifact-id={artifactId}
      data-enabled={enabled ? 'true' : 'false'}
      data-project-id={projectId}
    />
  ),
}));

vi.mock('@/components/project-terminal-panel', () => ({
  ProjectTerminalPanel: () => <div data-testid="terminal-panel" />,
}));

vi.mock('@/stores/artifact-files-store', () => ({
  useArtifactFilesStore: (
    selector: (state: { previewModeByArtifact: Record<string, 'file' | 'diff' | null> }) => unknown
  ) => selector(previewState),
}));

vi.mock('@/stores/terminals-store', () => ({
  useTerminalStore: (
    selector: (state: {
      dockByArtifact: Record<string, { open: boolean }>;
      toggleDock: ReturnType<typeof vi.fn>;
    }) => unknown
  ) => selector(terminalState),
}));

describe('ProjectLayoutShell', () => {
  beforeEach(() => {
    navigationState.pathname = '/project-1/artifact-1';
    navigationState.params = {
      projectId: 'project-1',
      artifactId: 'artifact-1',
    };
    previewState.previewModeByArtifact['project-1::artifact-1'] = null;
    terminalState.dockByArtifact['project-1::artifact-1'] = {
      open: false,
    };
    terminalState.toggleDock.mockClear();
  });

  it('shows checkpoint controls on artifact routes', () => {
    render(
      <ProjectLayoutShell>
        <div>Child content</div>
      </ProjectLayoutShell>
    );

    expect(screen.getByTestId('theme-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('checkpoint-controls')).toBeInTheDocument();
    expect(screen.getByTestId('checkpoint-controls')).toHaveAttribute('data-compact', 'false');
    expect(screen.getByTestId('artifact-command-menu')).toHaveAttribute('data-enabled', 'true');
    expect(screen.getByTestId('settings-button')).toBeInTheDocument();
  });

  it('passes compact mode when the preview drawer is open', () => {
    previewState.previewModeByArtifact['project-1::artifact-1'] = 'diff';

    render(
      <ProjectLayoutShell>
        <div>Child content</div>
      </ProjectLayoutShell>
    );

    expect(screen.getByTestId('checkpoint-controls')).toHaveAttribute('data-compact', 'true');
  });

  it('shows the command menu on session routes within an artifact', () => {
    navigationState.pathname = '/project-1/artifact-1/session-1';

    render(
      <ProjectLayoutShell>
        <div>Child content</div>
      </ProjectLayoutShell>
    );

    expect(screen.getByTestId('artifact-command-menu')).toHaveAttribute(
      'data-artifact-id',
      'artifact-1'
    );
  });

  it('hides checkpoint controls on project settings routes', () => {
    navigationState.pathname = '/project-1/settings/general';
    navigationState.params = {
      projectId: 'project-1',
    };

    render(
      <ProjectLayoutShell>
        <div>Child content</div>
      </ProjectLayoutShell>
    );

    expect(screen.queryByTestId('checkpoint-controls')).not.toBeInTheDocument();
    expect(screen.queryByTestId('artifact-command-menu')).not.toBeInTheDocument();
  });

  it('toggles the terminal dock from the header button', () => {
    render(
      <ProjectLayoutShell>
        <div>Child content</div>
      </ProjectLayoutShell>
    );

    fireEvent.click(screen.getByRole('button', { name: /toggle terminal/i }));

    expect(terminalState.toggleDock).toHaveBeenCalledWith({
      projectId: 'project-1',
      artifactId: 'artifact-1',
    });
    expect(screen.getByTestId('terminal-panel')).toBeInTheDocument();
  });
});
