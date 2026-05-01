'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type ProjectPreferencesStoreState = {
  advancedModeByProjectId: Record<string, boolean>;
  hasHydrated: boolean;
  isAdvancedModeEnabled: (projectId: string) => boolean;
  setProjectAdvancedMode: (projectId: string, enabled: boolean) => void;
  toggleProjectAdvancedMode: (projectId: string) => void;
  markHydrated: () => void;
  reset: () => void;
};

export const PROJECT_PREFERENCES_STORAGE_KEY = 'web-project-preferences-store';

const initialState = {
  advancedModeByProjectId: {},
  hasHydrated: false,
};

function buildNextAdvancedModeState(input: {
  current: Record<string, boolean>;
  projectId: string;
  enabled: boolean;
}) {
  const next = { ...input.current };

  if (input.enabled) {
    next[input.projectId] = true;
  } else {
    delete next[input.projectId];
  }

  return next;
}

export const useProjectPreferencesStore = create<ProjectPreferencesStoreState>()(
  persist(
    (set, get) => ({
      ...initialState,

      isAdvancedModeEnabled: (projectId) => get().advancedModeByProjectId[projectId] === true,

      setProjectAdvancedMode: (projectId, enabled) =>
        set((state) => ({
          advancedModeByProjectId: buildNextAdvancedModeState({
            current: state.advancedModeByProjectId,
            projectId,
            enabled,
          }),
        })),

      toggleProjectAdvancedMode: (projectId) => {
        const enabled = get().isAdvancedModeEnabled(projectId);
        get().setProjectAdvancedMode(projectId, !enabled);
      },

      markHydrated: () => set({ hasHydrated: true }),

      reset: () => set(initialState),
    }),
    {
      name: PROJECT_PREFERENCES_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        advancedModeByProjectId: state.advancedModeByProjectId,
      }),
      migrate: (persistedState) => {
        const state =
          persistedState && typeof persistedState === 'object'
            ? (persistedState as Partial<
                Pick<ProjectPreferencesStoreState, 'advancedModeByProjectId'>
              >)
            : {};

        return {
          ...initialState,
          advancedModeByProjectId: state.advancedModeByProjectId ?? {},
        };
      },
      onRehydrateStorage: () => (state) => {
        state?.markHydrated();
      },
    }
  )
);
