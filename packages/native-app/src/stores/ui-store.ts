'use client';

import { Uniwind } from 'uniwind';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { type AppThemeName, getInitialAppTheme, getNextTheme, isAppTheme } from '@/lib/app-theme';
import { asyncJsonStorage } from '@/lib/state-storage';

type SettingsTab = 'general' | 'model' | 'keys';

type SideDrawerProps = {
  open: boolean;
  badge?: number;
  title: string | (() => React.ReactNode);
  renderContent: () => React.ReactNode;
};

type UiStorePersistedState = {
  theme: AppThemeName;
};

type UiStoreState = {
  theme: AppThemeName;
  isSidebarCollapsed: boolean;
  sideDrawer: SideDrawerProps;
  isMobileSidebarOpen: boolean;
  isSettingsOpen: boolean;
  activeSettingsTab: SettingsTab;
  renameSessionId: string | null;
  deleteSessionId: string | null;
  setTheme: (theme: AppThemeName) => void;
  toggleTheme: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;
  openSideDrawer: (props: Omit<SideDrawerProps, 'open'>) => void;
  updateSideDrawer: (props: Partial<SideDrawerProps>) => void;
  dismissSideDrawer: () => void;
  openMobileSidebar: () => void;
  closeMobileSidebar: () => void;
  toggleMobileSidebar: () => void;
  openSettings: (tab?: SettingsTab) => void;
  closeSettings: () => void;
  setActiveSettingsTab: (tab: SettingsTab) => void;
  openRenameSessionDialog: (sessionId: string) => void;
  closeRenameSessionDialog: () => void;
  openDeleteSessionDialog: (sessionId: string) => void;
  closeDeleteSessionDialog: () => void;
  resetUi: () => void;
};

const initialState = {
  theme: getInitialAppTheme(),
  isSidebarCollapsed: false,
  sideDrawer: { open: false, title: '', renderContent: () => null, badge: undefined },
  isMobileSidebarOpen: false,
  isSettingsOpen: false,
  activeSettingsTab: 'general' as SettingsTab,
  renameSessionId: null as string | null,
  deleteSessionId: null as string | null,
} satisfies Omit<
  UiStoreState,
  | 'setTheme'
  | 'toggleTheme'
  | 'setSidebarCollapsed'
  | 'toggleSidebarCollapsed'
  | 'openSideDrawer'
  | 'updateSideDrawer'
  | 'dismissSideDrawer'
  | 'openMobileSidebar'
  | 'closeMobileSidebar'
  | 'toggleMobileSidebar'
  | 'openSettings'
  | 'closeSettings'
  | 'setActiveSettingsTab'
  | 'openRenameSessionDialog'
  | 'closeRenameSessionDialog'
  | 'openDeleteSessionDialog'
  | 'closeDeleteSessionDialog'
  | 'resetUi'
>;

function applyTheme(theme: AppThemeName): void {
  Uniwind.setTheme(theme);
}

applyTheme(initialState.theme);

export const useUiStore = create<UiStoreState>()(
  persist(
    (set) => ({
      ...initialState,

      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
      toggleTheme: () => {
        set((state) => {
          const next = getNextTheme(state.theme);
          applyTheme(next);
          return { theme: next };
        });
      },
      setSidebarCollapsed: (collapsed) => set({ isSidebarCollapsed: collapsed }),
      toggleSidebarCollapsed: () =>
        set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
      openSideDrawer: (props: Omit<SideDrawerProps, 'open'>) => {
        set({ sideDrawer: { ...props, open: true } });
      },
      updateSideDrawer: (props: Partial<SideDrawerProps>) =>
        set((state) => ({
          sideDrawer: { ...state.sideDrawer, ...props },
        })),
      dismissSideDrawer: () =>
        set({
          sideDrawer: { open: false, title: '', renderContent: () => null, badge: undefined },
        }),

      openMobileSidebar: () => set({ isMobileSidebarOpen: true }),
      closeMobileSidebar: () => set({ isMobileSidebarOpen: false }),
      toggleMobileSidebar: () =>
        set((state) => ({ isMobileSidebarOpen: !state.isMobileSidebarOpen })),

      openSettings: (tab) =>
        set({
          isSettingsOpen: true,
          activeSettingsTab: tab ?? 'general',
        }),

      closeSettings: () => set({ isSettingsOpen: false }),
      setActiveSettingsTab: (tab) => set({ activeSettingsTab: tab }),

      openRenameSessionDialog: (sessionId) => set({ renameSessionId: sessionId }),
      closeRenameSessionDialog: () => set({ renameSessionId: null }),

      openDeleteSessionDialog: (sessionId) => set({ deleteSessionId: sessionId }),
      closeDeleteSessionDialog: () => set({ deleteSessionId: null }),

      resetUi: () => {
        applyTheme(initialState.theme);
        set(initialState);
      },
    }),
    {
      name: 'native-app-ui-store',
      version: 1,
      storage: asyncJsonStorage,
      partialize: (state): UiStorePersistedState => ({
        theme: state.theme,
      }),
      onRehydrateStorage: () => (state) => {
        if (isAppTheme(state?.theme)) {
          applyTheme(state.theme);
        }
      },
    }
  )
);
