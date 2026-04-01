"use client";

import { create } from "zustand";

type SettingsTab = "general" | "model" | "keys";
type Theme = "light" | "dark";

type SideDrawerProps = {
  open: boolean;
  badge?: number;
  title: string | (() => React.ReactNode);
  renderContent: () => React.ReactNode;
};

type UiStoreState = {
  theme: Theme;
  isThemeHydrated: boolean;
  isSidebarCollapsed: boolean;
  sideDrawer: SideDrawerProps;
  isMobileSidebarOpen: boolean;
  isSettingsOpen: boolean;
  activeSettingsTab: SettingsTab;
  renameSessionId: string | null;
  deleteSessionId: string | null;
  hydrateTheme: (theme: Theme) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;
  openSideDrawer: (props: Omit<SideDrawerProps, "open">) => void;
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

const THEME_STORAGE_KEY = "theme";

function getInitialTheme(): Theme {
  return "light";
}

function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

function persistTheme(theme: Theme): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
}

function createInitialState() {
  return {
    theme: getInitialTheme(),
    isThemeHydrated: false,
    isSidebarCollapsed: false,
    sideDrawer: {
      open: false,
      title: "",
      renderContent: () => null,
      badge: undefined,
    } satisfies SideDrawerProps,
    isMobileSidebarOpen: false,
    isSettingsOpen: false,
    activeSettingsTab: "keys" as SettingsTab,
    renameSessionId: null as string | null,
    deleteSessionId: null as string | null,
  };
}

export const useUiStore = create<UiStoreState>((set) => ({
  ...createInitialState(),

  hydrateTheme: (theme) => {
    applyTheme(theme);
    persistTheme(theme);
    set({ theme, isThemeHydrated: true });
  },

  setTheme: (theme) => {
    applyTheme(theme);
    persistTheme(theme);
    set({ theme, isThemeHydrated: true });
  },

  toggleTheme: () => {
    set((state) => {
      const theme = state.theme === "light" ? "dark" : "light";
      applyTheme(theme);
      persistTheme(theme);
      return { theme, isThemeHydrated: true };
    });
  },

  setSidebarCollapsed: (collapsed) => set({ isSidebarCollapsed: collapsed }),
  toggleSidebarCollapsed: () =>
    set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),

  openSideDrawer: (props) => {
    set({ sideDrawer: { ...props, open: true } });
  },

  updateSideDrawer: (props) =>
    set((state) => ({
      sideDrawer: { ...state.sideDrawer, ...props },
    })),

  dismissSideDrawer: () =>
    set({
      sideDrawer: {
        open: false,
        title: "",
        renderContent: () => null,
        badge: undefined,
      },
    }),

  openMobileSidebar: () => set({ isMobileSidebarOpen: true }),
  closeMobileSidebar: () => set({ isMobileSidebarOpen: false }),
  toggleMobileSidebar: () =>
    set((state) => ({ isMobileSidebarOpen: !state.isMobileSidebarOpen })),

  openSettings: (tab) =>
    set({
      isSettingsOpen: true,
      activeSettingsTab: tab ?? "keys",
    }),

  closeSettings: () => set({ isSettingsOpen: false }),
  setActiveSettingsTab: (tab) => set({ activeSettingsTab: tab }),

  openRenameSessionDialog: (sessionId) => set({ renameSessionId: sessionId }),
  closeRenameSessionDialog: () => set({ renameSessionId: null }),

  openDeleteSessionDialog: (sessionId) => set({ deleteSessionId: sessionId }),
  closeDeleteSessionDialog: () => set({ deleteSessionId: null }),

  resetUi: () => set(createInitialState()),
}));
