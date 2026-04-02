import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ArtifactInstalledSkillDto, RegisteredSkillDto } from '@/lib/client-api';
import type { ReactNode } from 'react';

import { ArtifactCommandMenu } from '@/components/artifact-command-menu';


const toastMock = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));

const hookState = vi.hoisted(() => ({
  registeredSkills: [] as RegisteredSkillDto[],
  installedSkills: [] as ArtifactInstalledSkillDto[],
  registeredLoading: false,
  installedLoading: false,
  registeredError: null as Error | null,
  installedError: null as Error | null,
  installMutateAsync: vi.fn(),
  reloadMutateAsync: vi.fn(),
  deleteMutateAsync: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: toastMock,
}));

vi.mock('@/hooks/api', () => ({
  useRegisteredSkillsQuery: () => ({
    data: hookState.registeredSkills,
    error: hookState.registeredError,
    isLoading: hookState.registeredLoading,
  }),
  useInstalledArtifactSkillsQuery: () => ({
    data: hookState.installedSkills,
    error: hookState.installedError,
    isLoading: hookState.installedLoading,
  }),
  useInstallArtifactSkillMutation: () => ({
    mutateAsync: hookState.installMutateAsync,
  }),
  useReloadArtifactSkillMutation: () => ({
    mutateAsync: hookState.reloadMutateAsync,
  }),
  useDeleteArtifactSkillMutation: () => ({
    mutateAsync: hookState.deleteMutateAsync,
  }),
}));

vi.mock('@/components/ui/command', () => ({
  CommandDialog: ({ children, open }: { children: ReactNode; open?: boolean }) =>
    open ? <div role="dialog">{children}</div> : null,
  CommandEmpty: ({ children }: { children: ReactNode }) => (
    <div data-slot="command-empty">{children}</div>
  ),
  CommandInput: ({
    onValueChange,
    placeholder,
    value,
  }: {
    onValueChange?: (value: string) => void;
    placeholder?: string;
    value?: string;
  }) => (
    <input
      placeholder={placeholder}
      value={value ?? ''}
      onChange={(event) => onValueChange?.(event.currentTarget.value)}
    />
  ),
  CommandItem: ({
    children,
    className,
    disabled,
    onSelect,
    value,
  }: {
    children: ReactNode;
    className?: string;
    disabled?: boolean;
    onSelect?: (value: string) => void;
    value?: string;
  }) => (
    <button
      type="button"
      data-slot="command-item"
      className={className}
      disabled={disabled}
      onClick={() => onSelect?.(value ?? '')}
    >
      {children}
    </button>
  ),
  CommandList: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div data-slot="command-list" className={className}>
      {children}
    </div>
  ),
}));

const REGISTERED_SKILLS: RegisteredSkillDto[] = [
  {
    name: 'github',
    link: 'https://example.test/github',
    description: 'GitHub helpers',
  },
  {
    name: 'pdf',
    link: 'https://example.test/pdf',
    description: 'PDF helpers',
  },
];

const INSTALLED_PDF_SKILL: ArtifactInstalledSkillDto = {
  name: 'pdf',
  link: 'https://example.test/pdf',
  description: 'PDF helpers',
  path: '.max/skills/pdf/SKILL.md',
};

function openWithMetaShortcut(): void {
  fireEvent.keyDown(window, {
    key: 'k',
    metaKey: true,
  });
}

function openWithCtrlShortcut(): void {
  fireEvent.keyDown(window, {
    key: 'k',
    ctrlKey: true,
  });
}

function getCommandItemLabels(): string[] {
  return Array.from(document.querySelectorAll("[data-slot='command-item']")).map(
    (element) => element.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  );
}

function resetHookState(): void {
  hookState.registeredSkills = [];
  hookState.installedSkills = [];
  hookState.registeredLoading = false;
  hookState.installedLoading = false;
  hookState.registeredError = null;
  hookState.installedError = null;
  hookState.installMutateAsync.mockReset().mockResolvedValue(INSTALLED_PDF_SKILL);
  hookState.reloadMutateAsync.mockReset().mockResolvedValue(INSTALLED_PDF_SKILL);
  hookState.deleteMutateAsync.mockReset().mockResolvedValue({
    deleted: true,
    skillName: 'pdf',
  });
}

describe('ArtifactCommandMenu', () => {
  beforeEach(() => {
    resetHookState();
    toastMock.error.mockReset();
    toastMock.success.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens on meta + k', () => {
    render(<ArtifactCommandMenu enabled projectId="project-1" artifactId="artifact-1" />);

    openWithMetaShortcut();

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search commands...')).toBeInTheDocument();
  });

  it('opens on ctrl + k', () => {
    render(<ArtifactCommandMenu enabled projectId="project-1" artifactId="artifact-1" />);

    openWithCtrlShortcut();

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('renders the expected root command order', () => {
    render(<ArtifactCommandMenu enabled projectId="project-1" artifactId="artifact-1" />);

    openWithMetaShortcut();

    expect(getCommandItemLabels()).toEqual(['Add Skill', 'Reload Skill', 'Delete Skill']);
  });

  it('shows available skills as registered minus installed for add skill', () => {
    hookState.registeredSkills = REGISTERED_SKILLS;
    hookState.installedSkills = [INSTALLED_PDF_SKILL];

    render(<ArtifactCommandMenu enabled projectId="project-1" artifactId="artifact-1" />);

    openWithMetaShortcut();
    fireEvent.click(screen.getByText('Add Skill'));

    expect(screen.getByText('github')).toBeInTheDocument();
    expect(screen.queryByText('pdf')).not.toBeInTheDocument();
  });

  it('shows installed skills for reload and filters them', () => {
    hookState.installedSkills = [INSTALLED_PDF_SKILL];

    render(<ArtifactCommandMenu enabled projectId="project-1" artifactId="artifact-1" />);

    openWithMetaShortcut();
    fireEvent.click(screen.getByText('Reload Skill'));

    expect(screen.getByText('Reload Skill')).toBeInTheDocument();
    expect(screen.getByText('pdf')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search installed skills...'), {
      target: { value: 'missing' },
    });

    expect(screen.getByText('No installed skills match "missing".')).toBeInTheDocument();
  });

  it('shows installed skills for delete and filters them', () => {
    hookState.installedSkills = [INSTALLED_PDF_SKILL];

    render(<ArtifactCommandMenu enabled projectId="project-1" artifactId="artifact-1" />);

    openWithMetaShortcut();
    fireEvent.click(screen.getByText('Delete Skill'));

    expect(screen.getByText('pdf')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search installed skills...'), {
      target: { value: 'pdf' },
    });

    expect(screen.getByText('pdf')).toBeInTheDocument();
  });

  it('returns to the root menu on escape from a nested skill page', () => {
    hookState.installedSkills = [INSTALLED_PDF_SKILL];

    render(<ArtifactCommandMenu enabled projectId="project-1" artifactId="artifact-1" />);

    openWithMetaShortcut();
    fireEvent.click(screen.getByText('Reload Skill'));
    fireEvent.keyDown(screen.getByRole('dialog'), {
      key: 'Escape',
    });

    expect(screen.getByPlaceholderText('Search commands...')).toBeInTheDocument();
    expect(screen.getByText('Add Skill')).toBeInTheDocument();
  });

  it('closes the menu on escape from the root view', async () => {
    render(<ArtifactCommandMenu enabled projectId="project-1" artifactId="artifact-1" />);

    openWithMetaShortcut();
    fireEvent.keyDown(screen.getByRole('dialog'), {
      key: 'Escape',
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('shows loading state and closes after a successful add skill mutation', async () => {
    vi.useFakeTimers();
    hookState.registeredSkills = REGISTERED_SKILLS;

    let resolveInstall: (() => void) | null = null;
    hookState.installMutateAsync.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveInstall = () => resolve(INSTALLED_PDF_SKILL);
        })
    );

    render(<ArtifactCommandMenu enabled projectId="project-1" artifactId="artifact-1" />);

    openWithMetaShortcut();
    fireEvent.click(screen.getByText('Add Skill'));
    fireEvent.click(screen.getByText('pdf'));

    expect(hookState.installMutateAsync).toHaveBeenCalledWith({ skillName: 'pdf' });
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();

    await act(async () => {
      resolveInstall?.();
      await Promise.resolve();
    });

    expect(toastMock.success).toHaveBeenCalledWith('Installed pdf');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    openWithMetaShortcut();
    expect(screen.getByText('Add Skill')).toBeInTheDocument();
  });

  it('reloads an installed skill and closes on success', async () => {
    hookState.installedSkills = [INSTALLED_PDF_SKILL];

    render(<ArtifactCommandMenu enabled projectId="project-1" artifactId="artifact-1" />);

    openWithMetaShortcut();
    fireEvent.click(screen.getByText('Reload Skill'));
    fireEvent.click(screen.getByText('pdf'));

    await waitFor(() => {
      expect(hookState.reloadMutateAsync).toHaveBeenCalledWith('pdf');
    });
    expect(toastMock.success).toHaveBeenCalledWith('Reloaded pdf');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('deletes an installed skill immediately and closes on success', async () => {
    hookState.installedSkills = [INSTALLED_PDF_SKILL];

    render(<ArtifactCommandMenu enabled projectId="project-1" artifactId="artifact-1" />);

    openWithMetaShortcut();
    fireEvent.click(screen.getByText('Delete Skill'));
    fireEvent.click(screen.getByText('pdf'));

    await waitFor(() => {
      expect(hookState.deleteMutateAsync).toHaveBeenCalledWith('pdf');
    });
    expect(toastMock.success).toHaveBeenCalledWith('Deleted pdf');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the menu open and shows the server error when a mutation fails', async () => {
    hookState.installedSkills = [INSTALLED_PDF_SKILL];
    hookState.reloadMutateAsync.mockRejectedValue(new Error('Skill reload blocked by active run'));

    render(<ArtifactCommandMenu enabled projectId="project-1" artifactId="artifact-1" />);

    openWithMetaShortcut();
    fireEvent.click(screen.getByText('Reload Skill'));
    fireEvent.click(screen.getByText('pdf'));

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Skill reload blocked by active run');
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('pdf')).toBeInTheDocument();
  });

  it('shows empty states for all skills installed and no installed skills', () => {
    hookState.registeredSkills = REGISTERED_SKILLS;
    hookState.installedSkills = [
      INSTALLED_PDF_SKILL,
      {
        name: 'github',
        link: 'https://example.test/github',
        description: 'GitHub helpers',
        path: '.max/skills/github/SKILL.md',
      },
    ];

    render(<ArtifactCommandMenu enabled projectId="project-1" artifactId="artifact-1" />);

    openWithMetaShortcut();
    fireEvent.click(screen.getByText('Add Skill'));
    expect(screen.getByText('All available skills are installed.')).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('dialog'), {
      key: 'Escape',
    });
    fireEvent.click(screen.getByText('Delete Skill'));
    expect(screen.getByText('pdf')).toBeInTheDocument();
  });

  it('shows no installed skills found when reload and delete have no installed skills', () => {
    render(<ArtifactCommandMenu enabled projectId="project-1" artifactId="artifact-1" />);

    openWithMetaShortcut();
    fireEvent.click(screen.getByText('Reload Skill'));
    expect(screen.getByText('No installed skills found.')).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('dialog'), {
      key: 'Escape',
    });
    fireEvent.click(screen.getByText('Delete Skill'));
    expect(screen.getByText('No installed skills found.')).toBeInTheDocument();
  });
});
