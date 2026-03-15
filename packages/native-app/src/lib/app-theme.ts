import { Appearance } from 'react-native';

const LIGHT_THEME = 'light';
const DARK_THEME = 'dark';
const LAVENDER_LIGHT_THEME = 'lavender-light';
const LAVENDER_DARK_THEME = 'lavender-dark';
const MINT_LIGHT_THEME = 'mint-light';
const MINT_DARK_THEME = 'mint-dark';
const SKY_LIGHT_THEME = 'sky-light';
const SKY_DARK_THEME = 'sky-dark';

export const appThemes = [
  LIGHT_THEME,
  DARK_THEME,
  LAVENDER_LIGHT_THEME,
  LAVENDER_DARK_THEME,
  MINT_LIGHT_THEME,
  MINT_DARK_THEME,
  SKY_LIGHT_THEME,
  SKY_DARK_THEME,
] as const;

export type AppThemeName = (typeof appThemes)[number];

const LIGHT_THEME_SUFFIX = '-light';
const DARK_THEME_SUFFIX = '-dark';

export function getInitialAppTheme(): AppThemeName {
  return Appearance.getColorScheme() === DARK_THEME ? DARK_THEME : LIGHT_THEME;
}

export function isAppTheme(value: unknown): value is AppThemeName {
  return typeof value === 'string' && appThemes.includes(value as AppThemeName);
}

export function isLightTheme(theme: AppThemeName): boolean {
  return theme === LIGHT_THEME || theme.endsWith(LIGHT_THEME_SUFFIX);
}

export function isDarkTheme(theme: AppThemeName): boolean {
  return theme === DARK_THEME || theme.endsWith(DARK_THEME_SUFFIX);
}

export function getNextTheme(theme: AppThemeName): AppThemeName {
  switch (theme) {
    case LIGHT_THEME:
      return DARK_THEME;
    case DARK_THEME:
      return LIGHT_THEME;
    case LAVENDER_LIGHT_THEME:
      return LAVENDER_DARK_THEME;
    case LAVENDER_DARK_THEME:
      return LAVENDER_LIGHT_THEME;
    case MINT_LIGHT_THEME:
      return MINT_DARK_THEME;
    case MINT_DARK_THEME:
      return MINT_LIGHT_THEME;
    case SKY_LIGHT_THEME:
      return SKY_DARK_THEME;
    case SKY_DARK_THEME:
      return SKY_LIGHT_THEME;
  }
}
