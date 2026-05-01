import { afterEach, describe, expect, it } from 'vitest';

import {
  PROJECT_PREFERENCES_STORAGE_KEY,
  useProjectPreferencesStore,
} from '@/stores/project-preferences-store';

describe('project preferences store', () => {
  afterEach(() => {
    useProjectPreferencesStore.getState().reset();
    window.localStorage.clear();
  });

  it('defaults advanced mode to off for every project', () => {
    expect(useProjectPreferencesStore.getState().isAdvancedModeEnabled('project-1')).toBe(false);
    expect(useProjectPreferencesStore.getState().isAdvancedModeEnabled('project-2')).toBe(false);
  });

  it('persists advanced mode in browser storage for the current project', () => {
    useProjectPreferencesStore.getState().setProjectAdvancedMode('project-1', true);

    const persisted = JSON.parse(
      window.localStorage.getItem(PROJECT_PREFERENCES_STORAGE_KEY) ?? '{}'
    );

    expect(persisted.state.advancedModeByProjectId['project-1']).toBe(true);
  });

  it('keeps advanced mode scoped per project', () => {
    useProjectPreferencesStore.getState().setProjectAdvancedMode('project-1', true);
    useProjectPreferencesStore.getState().setProjectAdvancedMode('project-2', false);

    expect(useProjectPreferencesStore.getState().isAdvancedModeEnabled('project-1')).toBe(true);
    expect(useProjectPreferencesStore.getState().isAdvancedModeEnabled('project-2')).toBe(false);
  });
});
