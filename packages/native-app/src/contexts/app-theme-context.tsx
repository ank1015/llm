import React, { createContext, useContext, useMemo } from 'react';

import { type AppThemeName, isDarkTheme, isLightTheme } from '@/lib/app-theme';
import { useUiStore } from '@/stores/ui-store';

interface AppThemeContextType {
  currentTheme: AppThemeName;
  isLight: boolean;
  isDark: boolean;
  setTheme: (theme: AppThemeName) => void;
  toggleTheme: () => void;
}

const AppThemeContext = createContext<AppThemeContextType | undefined>(undefined);

export const AppThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const currentTheme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);
  const toggleTheme = useUiStore((state) => state.toggleTheme);

  const isLight = useMemo(() => isLightTheme(currentTheme), [currentTheme]);
  const isDark = useMemo(() => isDarkTheme(currentTheme), [currentTheme]);

  const value = useMemo(
    () => ({
      currentTheme,
      isLight,
      isDark,
      setTheme,
      toggleTheme,
    }),
    [currentTheme, isLight, isDark, setTheme, toggleTheme]
  );

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
};

export const useAppTheme = () => {
  const context = useContext(AppThemeContext);
  if (!context) {
    throw new Error('useAppTheme must be used within AppThemeProvider');
  }
  return context;
};
