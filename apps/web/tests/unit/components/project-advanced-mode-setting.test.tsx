import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { ProjectAdvancedModeSetting } from '@/components/project-advanced-mode-setting';
import {
  PROJECT_PREFERENCES_STORAGE_KEY,
  useProjectPreferencesStore,
} from '@/stores/project-preferences-store';

describe('ProjectAdvancedModeSetting', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useProjectPreferencesStore.setState({
      advancedModeByProjectId: {},
      hasHydrated: true,
    });
  });

  it('toggles advanced mode for the current project', () => {
    render(<ProjectAdvancedModeSetting projectId="project-1" />);

    const toggle = screen.getByRole('switch', { name: /toggle advanced mode/i });

    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('Off')).toBeInTheDocument();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('On')).toBeInTheDocument();
    expect(useProjectPreferencesStore.getState().isAdvancedModeEnabled('project-1')).toBe(true);

    const persisted = JSON.parse(
      window.localStorage.getItem(PROJECT_PREFERENCES_STORAGE_KEY) ?? '{}'
    );

    expect(persisted.state.advancedModeByProjectId['project-1']).toBe(true);
  });
});
