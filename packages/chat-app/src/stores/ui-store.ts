'use client';

import { create } from 'zustand';

type SettingsTab = 'general' | 'model' | 'keys';

type UiStoreState = {
  isSidebarCollapsed: boolean;
  isMobileSidebarOpen: boolean;
  isSettingsOpen: boolean;
  activeSettingsTab: SettingsTab;
  renameSessionId: string | null;
  deleteSessionId: string | null;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;
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
  isSidebarCollapsed: false,
  isMobileSidebarOpen: false,
  isSettingsOpen: false,
  activeSettingsTab: 'general' as SettingsTab,
  renameSessionId: null as string | null,
  deleteSessionId: null as string | null,
};

export const useUiStore = create<UiStoreState>((set) => ({
  ...initialState,

  setSidebarCollapsed: (collapsed) => set({ isSidebarCollapsed: collapsed }),
  toggleSidebarCollapsed: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),

  openMobileSidebar: () => set({ isMobileSidebarOpen: true }),
  closeMobileSidebar: () => set({ isMobileSidebarOpen: false }),
  toggleMobileSidebar: () => set((state) => ({ isMobileSidebarOpen: !state.isMobileSidebarOpen })),

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

  resetUi: () => set(initialState),
}));
