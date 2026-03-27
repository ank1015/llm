import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createTerminalMock, getProjectOverviewMock, listTerminalsMock, openTerminalSocketMock } =
  vi.hoisted(() => ({
    createTerminalMock: vi.fn(),
    getProjectOverviewMock: vi.fn(),
    listTerminalsMock: vi.fn(),
    openTerminalSocketMock: vi.fn(),
  }));

vi.mock('next/navigation', () => ({
  useParams: () => ({
    projectId: 'project-1',
    artifactId: 'artifact-1',
    threadId: 'thread-1',
  }),
  usePathname: () => '/project-1/artifact-1/thread-1',
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock('@/components/terminal-surface', () => ({
  TerminalSurface: ({ terminalId }: { terminalId: string }) => <div>Surface {terminalId}</div>,
}));

vi.mock('@/lib/use-typewriter', () => ({
  useTypewriter: (value: string) => value,
}));

vi.mock('@/lib/client-api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/client-api')>('@/lib/client-api');

  return {
    ...actual,
    createTerminal: createTerminalMock,
    getProjectOverview: getProjectOverviewMock,
    listTerminals: listTerminalsMock,
    openTerminalSocket: openTerminalSocketMock,
  };
});

describe('ArtifactTerminalDock', () => {
  beforeEach(async () => {
    listTerminalsMock.mockReset();
    createTerminalMock.mockReset();
    getProjectOverviewMock.mockReset();
    openTerminalSocketMock.mockReset();

    listTerminalsMock.mockResolvedValue([]);
    createTerminalMock.mockResolvedValue({
      id: 'terminal-1',
      title: 'Terminal 1',
      status: 'running',
      projectId: 'project-1',
      artifactId: 'artifact-1',
      cwdAtLaunch: '/tmp/artifact-1',
      shell: '/bin/zsh',
      cols: 120,
      rows: 30,
      createdAt: '2026-03-27T00:00:00.000Z',
      lastActiveAt: '2026-03-27T00:00:00.000Z',
      exitCode: null,
      signal: null,
      exitedAt: null,
    });
    getProjectOverviewMock.mockResolvedValue({
      project: {
        id: 'project-1',
        name: 'Project 1',
        createdAt: '2026-03-27T00:00:00.000Z',
      },
      artifactDirs: [
        {
          id: 'artifact-1',
          name: 'Artifact 1',
          description: null,
          createdAt: '2026-03-27T00:00:00.000Z',
          sessions: [
            {
              sessionId: 'thread-1',
              sessionName: 'Thread 1',
              createdAt: '2026-03-27T00:00:00.000Z',
              updatedAt: null,
              nodeCount: 1,
            },
          ],
        },
      ],
    });
    openTerminalSocketMock.mockReturnValue({
      sendInput: vi.fn(),
      sendResize: vi.fn(),
      close: vi.fn(),
      readyState: () => 1,
    });

    const { useSidebarStore } = await import('@/stores/sidebar-store');
    const { useTerminalStore } = await import('@/stores/terminals-store');

    useSidebarStore.setState({
      projectName: 'Project 1',
      artifactDirs: [
        {
          id: 'artifact-1',
          name: 'Artifact 1',
          description: null,
          createdAt: '2026-03-27T00:00:00.000Z',
          sessions: [
            {
              sessionId: 'thread-1',
              sessionName: 'Thread 1',
              createdAt: '2026-03-27T00:00:00.000Z',
              updatedAt: null,
              nodeCount: 1,
            },
          ],
        },
      ],
      isLoading: false,
    });
    useTerminalStore.getState().reset();
  });

  afterEach(async () => {
    const { useTerminalStore } = await import('@/stores/terminals-store');
    useTerminalStore.getState().reset();
  });

  it('opens the dock with Ctrl+` and auto-creates the first terminal', async () => {
    const { ArtifactTerminalDock } = await import('@/components/terminal-dock');

    await act(async () => {
      render(<ArtifactTerminalDock />);
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.keyDown(window, {
        ctrlKey: true,
        code: 'Backquote',
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(createTerminalMock).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText('Terminal 1')).toBeInTheDocument();
    expect(screen.getByText('Surface terminal-1')).toBeInTheDocument();
  });

  it('toggles the dock from the header terminal button', async () => {
    const { ArtifactTerminalDock } = await import('@/components/terminal-dock');
    const { Header } = await import('@/components/header');

    await act(async () => {
      render(
        <>
          <Header />
          <ArtifactTerminalDock />
        </>
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /terminal/i }));
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(createTerminalMock).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText('Terminal 1')).toBeInTheDocument();
  });
});
