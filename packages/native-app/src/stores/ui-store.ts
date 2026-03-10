'use client';

import { Appearance } from 'react-native';
import { Uniwind } from 'uniwind';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { asyncJsonStorage } from '@/lib/state-storage';

type SettingsTab = 'general' | 'model' | 'keys';

type SideDrawerProps = {
  open: boolean;
  badge?: number;
  title: string | (() => React.ReactNode);
  renderContent: () => React.ReactNode;
};

type Theme = 'light' | 'dark';

type UiStorePersistedState = {
  theme: Theme;
};

type UiStoreState = {
  theme: Theme;
  isSidebarCollapsed: boolean;
  sideDrawer: SideDrawerProps;
  isMobileSidebarOpen: boolean;
  isSettingsOpen: boolean;
  activeSettingsTab: SettingsTab;
  renameSessionId: string | null;
  deleteSessionId: string | null;
  setTheme: (theme: Theme) => void;
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
  theme: (Appearance.getColorScheme() === 'dark' ? 'dark' : 'light') as Theme,
  isSidebarCollapsed: false,
  sideDrawer: { open: false, title: '', renderContent: () => null, badge: undefined },
  isMobileSidebarOpen: false,
  isSettingsOpen: false,
  activeSettingsTab: 'general' as SettingsTab,
  renameSessionId: null as string | null,
  deleteSessionId: null as string | null,
};

function applyTheme(theme: Theme): void {
  Uniwind.setTheme(theme);
}

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
          const next = state.theme === 'light' ? 'dark' : 'light';
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
        if (state?.theme) {
          applyTheme(state.theme);
        }
      },
    }
  )
);
