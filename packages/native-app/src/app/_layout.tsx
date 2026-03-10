import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { useTheme } from '@/hooks/use-theme';
import { useUiStore } from '@/stores/ui-store';

function useSyncWebThemeClass(theme: 'light' | 'dark'): void {
  useEffect(() => {
    if (process.env.EXPO_OS !== 'web') {
      return;
    }

    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);
}

export default function RootLayout() {
  const themeName = useUiStore((state) => state.theme);
  const theme = useTheme();

  useSyncWebThemeClass(themeName);

  const navigationTheme =
    themeName === 'dark'
      ? {
          ...DarkTheme,
          colors: {
            ...DarkTheme.colors,
            background: theme.homePage,
            border: theme.homeBorder,
            card: theme.homePage,
            notification: theme.primary,
            primary: theme.primary,
            text: theme.text,
          },
        }
      : {
          ...DefaultTheme,
          colors: {
            ...DefaultTheme.colors,
            background: theme.homePage,
            border: theme.homeBorder,
            card: theme.homePage,
            notification: theme.primary,
            primary: theme.primary,
            text: theme.text,
          },
        };

  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style={themeName === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          contentStyle: {
            backgroundColor: theme.homePage,
          },
          headerShadowVisible: false,
          headerStyle: {
            backgroundColor: theme.homePage,
          },
          headerTintColor: theme.text,
          headerTitleStyle: {
            color: theme.text,
            fontWeight: '600',
          },
        }}
      />
    </ThemeProvider>
  );
}
