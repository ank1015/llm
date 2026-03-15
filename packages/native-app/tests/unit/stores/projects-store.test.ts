import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createProjectMock, deleteProjectMock, listProjectsMock, renameProjectMock } = vi.hoisted(
  () => ({
    createProjectMock: vi.fn(),
    deleteProjectMock: vi.fn(),
    listProjectsMock: vi.fn(),
    renameProjectMock: vi.fn(),
  })
);

vi.mock('@/lib/client-api', () => ({
  createProject: createProjectMock,
  deleteProject: deleteProjectMock,
  listProjects: listProjectsMock,
  renameProject: renameProjectMock,
}));

describe('projects store', () => {
  beforeEach(async () => {
    vi.resetModules();
    createProjectMock.mockReset();
    deleteProjectMock.mockReset();
    listProjectsMock.mockReset();
    renameProjectMock.mockReset();
  });

  it('fetches projects from the server boundary', async () => {
    const project = {
      createdAt: '2026-03-16T00:00:00.000Z',
      description: 'First project',
      id: 'project-1',
      name: 'Project One',
      projectImg: null,
    };

    listProjectsMock.mockResolvedValue([project]);

    const { useProjectsStore } = await import('@/stores/projects-store');
    await useProjectsStore.getState().fetchProjects();

    expect(useProjectsStore.getState().projects).toEqual([project]);
    expect(useProjectsStore.getState().error).toBeNull();
  });

  it('optimistically renames and reverts the project when the server call fails', async () => {
    renameProjectMock.mockRejectedValue(new Error('Rename failed'));

    const { useProjectsStore } = await import('@/stores/projects-store');
    useProjectsStore.setState({
      ...useProjectsStore.getState(),
      projects: [
        {
          createdAt: '2026-03-16T00:00:00.000Z',
          description: null,
          id: 'project-1',
          name: 'Before',
          projectImg: null,
        },
      ],
    });

    await expect(
      useProjectsStore.getState().renameProject('project-1', { name: 'After' })
    ).rejects.toThrow('Rename failed');

    expect(useProjectsStore.getState().projects[0]?.name).toBe('Before');
    expect(useProjectsStore.getState().mutationError).toBe('Rename failed');
  });
});
