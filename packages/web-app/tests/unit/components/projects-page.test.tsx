import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProjectDto } from '@ank1015/llm-app-contracts';

import ProjectsPage from '@/app/page';


const { listProjectsMock, routerPush } = vi.hoisted(() => ({
  listProjectsMock: vi.fn(),
  routerPush: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: routerPush,
  }),
}));

vi.mock('@/lib/client-api', () => ({
  createProject: vi.fn(),
  deleteProject: vi.fn(),
  listProjects: listProjectsMock,
}));

describe('ProjectsPage', () => {
  beforeEach(() => {
    routerPush.mockReset();
    listProjectsMock.mockReset();
  });

  it('renders projects loaded from the server DTO layer', async () => {
    const projects: ProjectDto[] = [
      {
        createdAt: '2026-03-16T00:00:00.000Z',
        description: 'First project',
        id: 'project-a',
        name: 'Project Alpha',
        projectImg: null,
      },
    ];

    listProjectsMock.mockResolvedValue(projects);

    render(<ProjectsPage />);

    expect(await screen.findByText('Project Alpha')).toBeInTheDocument();
    expect(screen.getByText('First project')).toBeInTheDocument();
  });
});
