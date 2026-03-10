import { Appearance } from 'react-native';

export const appThemes = [
  'light',
  'dark',
  'lavender-light',
  'lavender-dark',
  'mint-light',
  'mint-dark',
  'sky-light',
  'sky-dark',
] as const;

export type AppThemeName = (typeof appThemes)[number];

export function getInitialAppTheme(): AppThemeName {
  return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
}

export function isAppTheme(value: unknown): value is AppThemeName {
  return typeof value === 'string' && appThemes.includes(value as AppThemeName);
}

export function isLightTheme(theme: AppThemeName): boolean {
  return theme === 'light' || theme.endsWith('-light');
}

export function isDarkTheme(theme: AppThemeName): boolean {
  return theme === 'dark' || theme.endsWith('-dark');
}

export function getNextTheme(theme: AppThemeName): AppThemeName {
  switch (theme) {
    case 'light':
      return 'dark';
    case 'dark':
      return 'light';
    case 'lavender-light':
      return 'lavender-dark';
    case 'lavender-dark':
      return 'lavender-light';
    case 'mint-light':
      return 'mint-dark';
    case 'mint-dark':
      return 'mint-light';
    case 'sky-light':
      return 'sky-dark';
    case 'sky-dark':
      return 'sky-light';
  }
}
